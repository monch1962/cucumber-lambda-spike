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
  console.log('Received event: \n' + JSON.stringify(event))
  console.log(listFiles('/var/task/features'))
  console.log(shellExec('find', ['.', '-name', 'world.js']).output.toString())
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
    await copyStepFilesFromS3(s3bucket, s3StepFiles)
  }

  const featureFilename = saveEventFeatureToFile(event)

  const cucumberResult = await executeCucumber(featureFilename)
  console.log('cucumberResult: \n' + cucumberResult.toString())
  removeFile(featureFilename)
  if (s3StepFiles !== undefined) {
    console.log('s3StepFiles: ' + s3StepFiles)
    console.log('s3StepFiles.split(): ' + s3StepFiles.toString().split(','))
    const tmpFiles = listFiles('/tmp')
    console.log(tmpFiles)
    for (const stepFile in s3StepFiles) {
      removeFile(stepFile)
    }
  }

  var statusCode = 200
  if (cucumberResult.status === 1) {
    statusCode = 501
  }

  console.log('cucumberResult.output: \n' + JSON.stringify(cucumberResult))
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
  console.log('Lambda response: \n' + JSON.stringify(response))
  return response
}

const s3StepFileList = async (s3bucket) => {
  const s3StepFiles = await getFiles({ Bucket: s3bucket })
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
  var fs = require('fs')
  const path = require('path')

  for (const file of fileList) {
    const params = {
      Bucket: s3bucket,
      Key: file.toString()
    }
    const localFilename = path.join('/tmp/step-definitions/', file.toString())
    // const localFilename = '/tmp/step-definitions/' + file.toString()

    console.log('Copying from s3://' + s3bucket + '/' + file + ' to local file ' + localFilename)

    const localDir = path.parse(localFilename).dir
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir)
    }

    const fileData = getS3Object(params)
    fs.writeFileSync(localFilename, fileData, 'utf8')
    console.log('/tmp files: \n' + listFiles('/tmp'))
  }
  const tmpFiles = listFiles('/tmp')
  console.log('/tmp files: \n' + tmpFiles)
}

const getS3Object = (handle) => {
  return new Promise((resolve, reject) => {
    S3.getObject(handle, (err, data) => {
      if (err) reject(err)
      else resolve(data.Body)
    })
  })
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
  }
  // console.log('Feature: ' + feature)
  fs.writeFileSync(localFeatureFilename, feature, 'utf8')
  const command = 'cat'
  const args = [ localFeatureFilename ]
  const featureFileContent = shellExec(command, args)
  console.log('featureFileContent: \n' + featureFileContent.output)
  return localFeatureFilename
}

const executeCucumber = async (featureFilename) => {
  // const tmpFiles = listFiles('/tmp')
  console.log('/tmp files prior to executeCucumber: ' + listFiles('/tmp'))
  console.log('featureFilename: ' + featureFilename)
  const cmd = './cucumber-js'
  const args = [featureFilename, '--format', 'json', '--require', '"/tmp/**/*.js"']
  // const args = [featureFilename, '--format', 'json']

  // console.log(listFiles('/var/task/node_modules/cucumber/bin'))
  console.log(listFiles('./node_modules/cucumber/bin'))
  console.log('Cucumber request: \n' + cmd + ' ' + JSON.stringify(args).replace(/,/g, ' '))
  // const result = await shellExec(cmd, args, './node_modules/cucumber/bin')
  const result = await shell.spawnSync(cmd, args, { cwd: './node_modules/cucumber/bin', env: process.env, stdio: 'pipe', encoding: 'utf-8' })
  // const result = await shell.execSync('./cucumber-js ' + featureFilename + ' --format json --require /tmp/step-definitions/*.js',
  //   { cwd: '.node_modules/cucumber/bin', env: process.env, stdio: 'pipe', encoding: 'utf-8' })
  console.log('Cucumber response: \n' + JSON.stringify(result))
  // process.exit(1)
  const output = result.stdout
  const status = result.status
  return { status, output }
}

const listFiles = (directory) => {
  const cmd = 'ls'
  const args = ['-lR', directory + '/']
  console.log('Requesting directory listing for ' + directory)
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
  const result = shell.spawnSync(cmd, args, { cwd: cwd, env: process.env, stdio: 'pipe', encoding: 'utf-8', shell: true })
  // console.log('result.stderr: ' + result.stderr)
  // console.log('result.stdout: ' + result.stdout)
  // console.log('result.status: ' + result.status)
  // console.log('result.error: ' + result.error)
  const output = result.stdout
  const status = result.status
  return { status, output }
}

// const runCucumber = (args) => {
//   const cliArgs = { argv: args, cwd: process.cwd(), stdout: process.stdout }
//   let cli = (new require('cucumber').Cli)(cliArgs)
//   cli.run() // Returns a promise
// }
