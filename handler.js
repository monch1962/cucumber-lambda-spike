'use strict'

const AWS = require('aws-sdk')
const shell = require('shelljs')
const S3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
})
const s3bucket = process.env.S3_BUCKET_NAME || ''
console.log('Reading step files from ' + s3bucket)

module.exports.handler = async (event, context) => {
  console.log('Received event: ' + JSON.stringify(event))
  if (event.body === undefined) {
    return {
      statusCode: 400,
      feature: event,
      result: "Can't parse event.body.feature"
    }
  }
  var s3StepDefinitionFiles
  if (s3bucket !== '') {
    // Copy step files from S3 bucket to Lambda's own filesystem
    s3StepDefinitionFiles = await s3StepDefinitionFileList(s3bucket)
    console.log('Found the following S3 StepDefinitionFiles: ' + s3StepDefinitionFiles)
    copyStepDefinitionsFromS3(s3bucket, s3StepDefinitionFiles)
  }

  const featureFilename = saveEventFeatureToFile(event)
  // console.log('Feature file: ' + featureFilename)

  const cucumberResult = executeCucumber(featureFilename)
  // console.log('cucumberResult: ' + cucumberResult)

  // Remove both the saved feature file and the step files copied from S3, so they don't pollute
  // the file space for subsequent executions of this Lambda function in the same container
  // console.log('cucumberResult...')
  // console.log(cucumberResult)
  tidyUpFiles(featureFilename)
  // if (s3StepDefinitionFiles !== '') {
  //   s3StepDefinitionFileList.forEach(stepFile => {
  //     tidyUpFiles(stepFile)
  //   })
  // }

  if (cucumberResult.code === 1) {
    return {
      statusCode: 501,
      feature: event.body.feature,
      result: JSON.parse(cucumberResult)
    }
  }
  return {
    statusCode: 200,
    body: {
      feature: event.body.feature,
      result: JSON.parse(cucumberResult)
    }
  }
}

const s3StepDefinitionFileList = async (s3bucket) => {
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
      keys.push(obj.Key)
    }
  })
  if (response.IsTruncated) {
    const newParams = Object.assign({}, params)
    newParams.ContinuationToken = response.NextContinuationToken
    await getFiles(newParams, keys)
  }
  return keys
}

const copyStepDefinitionsFromS3 = (s3bucket, fileList) => {
  const fs = require('fs')
  const path = require('path')
  // console.log('fileList')
  // console.log(fileList)
  fileList.forEach(file => {
    const params = {
      Bucket: s3bucket,
      Key: file
    }
    const localFilename = path.join('tmp', 'step-definitions', file)
    console.log('Copying steps from s3://' + s3bucket + '/' + file + ' to local file ' + localFilename)
    const localFile = fs.createWriteStream(localFilename)
    console.log('Localfile details: ' + JSON.stringify(localFile))
    const fileResult = S3.getObject(params).createReadStream().pipe(localFile)
    console.log('File copy result: ' + JSON.stringify(fileResult))
    const localFileContent = shell.exec('cat ' + localFile)
    console.log('localFileContent: ' + localFileContent)
  })
}

const saveEventFeatureToFile = (event) => {
  const fs = require('fs')
  const localFeatureFilename = '/tmp/input.feature'
  var feature
  if (event == null) {
    // No event supplied - read a fake one from ./event.json and use that
    const featureJSON = fs.readFileSync('./event.json')
    feature = JSON.parse(featureJSON).body.feature
  } else {
    // Pull apart the event received from API Gateway
    feature = event.body.feature
  }
  // console.log('Feature: ' + feature)
  fs.writeFileSync(localFeatureFilename, feature, 'utf8')
  // console.log('Saved input feature to ' + localFeatureFilename)
  const featureFileContent = shell.exec('cat ' + localFeatureFilename)
  console.log(featureFileContent)
  return localFeatureFilename
}

const executeCucumber = (featureFilename) => {
  const dirFiles = 'ls -lR /tmp/'
  const files = shell.exec(dirFiles)
  console.log('files: ' + files)
  const shellCmd = './node_modules/.bin/cucumber-js ' + featureFilename + ' --format json --require "/tmp/step-definitions/*.js"'
  console.log('Cucumber request: ' + shellCmd)
  const response = shell.exec(shellCmd)
  // console.log('Cucumber response: ' + response)
  return response
}

const tidyUpFiles = (localFilename) => {
  shell.exec('rm ' + localFilename)
}
