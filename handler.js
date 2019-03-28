'use strict'

const AWS = require('aws-sdk')
const shell = require('child_process')
const taskRoot = process.env['LAMBDA_TASK_ROOT'] || __dirname
process.env.HOME = '/tmp'
process.env.PATH += ':' + taskRoot
var S3 = new AWS.S3({
  // accessKeyId: process.env.AWS_ACCESS_KEY,
  // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
})
const s3bucket = process.env.S3_BUCKET_NAME || ''
console.log('Reading step files from ' + s3bucket)

module.exports.handler = async (event, context) => {
  console.log('Received event: ' + JSON.stringify(event))
  if (event.body === null) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        feature: event,
        result: "Can't parse event.body.feature"
      })
    }
  }
  var s3StepFiles
  if (s3bucket !== '') {
    // Copy step files from S3 bucket to Lambda's own filesystem
    s3StepFiles = await s3StepFileList(s3bucket)
    console.log('Found the following S3 StepDefinitionFiles: ' + s3StepFiles)
    copyStepFilesFromS3(s3bucket, s3StepFiles)
  }

  const featureFilename = saveEventFeatureToFile(event)
  // console.log('Feature file: ' + featureFilename)

  const cucumberResult = executeCucumber(featureFilename)
  // console.log('cucumberResult: ' + cucumberResult)

  // Remove both the saved feature file and the step files copied from S3, so they don't pollute
  // the file space for subsequent executions of this Lambda function in the same container
  // console.log('cucumberResult...')
  // console.log(cucumberResult.output)
  removeFile(featureFilename)
  if (s3StepFiles !== undefined) {
    // console.log('s3StepFiles: ' + s3StepFiles)
    // console.log('s3StepFiles.split(): ' + s3StepFiles.toString().split(','))
    // const tmpFiles = listFiles('/tmp')
    // console.log(tmpFiles)
    s3StepFiles.forEach(stepFile => {
      removeFile(stepFile)
    })
  }

  var statusCode = 200
  if (cucumberResult.status === 1) {
    statusCode = 501
  }
  const response = {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // feature: event.body.feature,
      result: JSON.parse(cucumberResult.output)
    })
  }
  console.log('Response...')
  console.log(response)
  return response
}

const s3StepFileList = async (s3bucket) => {
  // console.log('Step and environment files are held in bucket ' + s3bucket)
  const s3StepFiles = await getFiles({ Bucket: s3bucket })
  // console.log('S3 step files: ' + s3StepFiles)
  return s3StepFiles
}

const getFiles = async (params) => {
  const response = await S3.listObjectsV2(params).promise()
  // console.log('S3 bucket contents: ' + JSON.stringify(response))
  var keys = []
  response.Contents.forEach(obj => {
    if (obj.Key.slice(-1) !== '/') {
      // console.log('Found S3 step file: ' + obj.Key)
      keys.push(obj.Key)
      // keys[keys.length] = obj.Key
    }
  })
  if (response.IsTruncated) {
    const newParams = Object.assign({}, params)
    newParams.ContinuationToken = response.NextContinuationToken
    await getFiles(newParams, keys)
  }
  // console.log('getFiles(): ' + keys)
  return keys
}

const copyStepFilesFromS3 = async (s3bucket, fileList) => {
  const fs = require('fs')
  const path = require('path')

  // console.log('typeof fileList: ' + typeof fileList)
  // console.log('typeof s3bucket: ' + typeof s3bucket)
  // fileList.forEach(file => {
  //   console.log('File: ' + file)
  // })
  fileList.forEach(file => {
    const params = {
      Bucket: s3bucket,
      Key: file.toString()
    }

    // console.log(S3.getObject(params))
    // console.log('typeof file: ' + typeof file)
    const localFilename = path.join('/tmp/step-definitions/', file)

    console.log('Copying from s3://' + s3bucket + '/' + file + ' to local file ' + localFilename)
    const localFile = fs.createWriteStream(localFilename)
    S3.getObject(params).createReadStream().pipe(localFile)

    // S3.getObject(params, (err, data) => {
    //   console.log('File data: ' + data.Body.toString('utf-8'))
    //   if (err) throw (err)

    //   fs.writeFileSync(data.Body.toString('utf-8'))
    //   console.log(`${localFilename} has been created`)
    // })
  })
  // console.log('Here')
  // process.exit(1)
}

const saveEventFeatureToFile = (event) => {
  const fs = require('fs')
  const escapeJSON = require('escape-json-node')
  const localFeatureFilename = '/tmp/input.feature'
  var feature
  if (event == null) {
    // No event supplied - read a fake one from ./event.json and use that
    const featureJSON = fs.readFileSync('./event.json')
    feature = JSON.parse(featureJSON).body.feature
  } else {
    // Pull apart the event received from API Gateway
    feature = JSON.parse(escapeJSON(event.body).replace(/\n/, '')).feature
    // console.log('Parsed feature: ' + feature)
    // exit(1)
  }
  // console.log('Feature: ' + feature)
  fs.writeFileSync(localFeatureFilename, feature, 'utf8')
  // console.log('Saved input feature to ' + localFeatureFilename)
  const command = 'cat'
  const args = [ localFeatureFilename ]
  const featureFileContent = shellExec(command, args)
  console.log('featureFileContent: ' + featureFileContent.output)
  // console.log('localFeatureFilename: ' + localFeatureFilename)
  return localFeatureFilename
}

const executeCucumber = (featureFilename) => {
  const tmpFiles = listFiles('/tmp')
  console.log('files: ' + tmpFiles)
  const cmd = './cucumber-js'
  const args = [featureFilename, '--format', 'json', '--require', '"/tmp/step-definitions/*.js"']
  const result = shellExec(cmd, args, './node_modules/cucumber/bin')
  console.log('Cucumber response: ' + result.output)
  return result
}

const listFiles = (directory) => {
  const cmd = 'ls'
  const args = ['-lR', directory + '/']
  const files = shellExec(cmd, args)
  return files.output
}

const removeFile = (localFilename) => {
  const cmd = 'rm'
  const args = ['-f', localFilename]
  const response = shellExec(cmd, args).toString()
  return response.status
}

const shellExec = (cmd, args, cwd) => {
  if (cwd === undefined) {
    cwd = process.cwd()
  }
  const result = shell.spawnSync(cmd, args, { cwd: cwd, env: process.env, stdio: 'pipe', encoding: 'utf-8' })
  const output = result.stdout
  const status = result.status
  return { status, output }
}
