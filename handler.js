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
  console.log('event: ' + JSON.stringify(event))
  if (event.body.feature === undefined) {
    return {
      statusCode: 400,
      feature: event,
      result: "Can't parse event.body.feature"
    }
  }
  if (s3bucket !== '') {
    // Copy step files from S3 bucket to Lambda's own filesystem
    const s3files = await s3FileList(s3bucket)
    copyFromS3(s3bucket, s3files)
  }

  const featureFilename = saveEventFeatureToFile(event)
  console.log('Feature file: ' + featureFilename)

  const cucumberResult = executeCucumber(featureFilename)
  console.log('cucumberResult: ' + cucumberResult)

  if (cucumberResult == '') {
    return {
      statusCode: 501,
      feature: event.body.feature,
      result: 'Cucumber returned no result - possibly missing step files?'
    }
  }
  return {
    statusCode: 200,
    body: {
      // message: 'Go Serverless v1.0! Your function executed successfully!',
      feature: event.body.feature,
      result: cucumberResult
    }
  }

  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // return { message: 'Go Serverless v1.0! Your function executed successfully!', event };

  // TODO: Return http 501 (Not Implemented) if Cucumber steps haven't been implemented yet
}

const s3FileList = async (s3bucket) => {
  console.log('Step and environment files are held in bucket ' + s3bucket)
  var fileList = await getFiles({ Bucket: s3bucket })
  console.log('S3 filelist: ' + fileList)
  return fileList
}

const getFiles = async (params) => {
  const response = await S3.listObjectsV2(params).promise()
  console.log('S3 bucket contents: ' + JSON.stringify(response))
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

const copyFromS3 = (s3bucket, fileList) => {
  const fs = require('fs')
  const path = require('path')
  console.log(fileList)
  fileList.forEach(file => {
    var params = {
      Bucket: s3bucket,
      Key: file
    }
    var localFilename = path.join('./features/step-definitions/', file)
    console.log('Copying steps from s3://' + s3bucket + '/' + file + ' to local file ' + localFilename)
    var localFile = fs.createWriteStream(localFilename)
    S3.getObject(params).createReadStream().pipe(localFile)
  })
}

const saveEventFeatureToFile = (event) => {
  const fs = require('fs')
  const tmp = require('tmp')
  const tmpobj = tmp.fileSync({ postfix: '.feature' })
  var feature
  // console.log('event to process: ' + JSON.stringify(event))
  if (event == null) {
    // No event supplied - read a fake one from ./event.json and use that
    const featureJSON = fs.readFileSync('./event.json')
    // console.log('featureJSON: ' + featureJSON)
    feature = JSON.parse(featureJSON).body.feature
    console.log('feature: ' + feature)
  } else {
    // Pull apart the event received from API Gateway
    // console.log('Received event: ' + JSON.stringify(event))
    // console.log('Received event.body: ' + JSON.stringify(event.body))
    // feature = JSON.stringify(event.body.feature)
    feature = event.body.feature
    console.log('feature from event: ' + feature)
  }
  console.log('Feature: ' + feature)
  fs.writeFileSync(tmpobj.name, feature, 'utf8')
  return tmpobj.name
}

const executeCucumber = (featureFilename) => {
  const dirFiles = 'ls -lR features/'
  const files = shell.exec(dirFiles)
  console.log('files: ' + files)
  const shellCmd = './node_modules/.bin/cucumber-js ' + featureFilename + ' --format json -s "./features/step-definitions/*.js"'
  console.log('Cucumber request: ' + shellCmd)
  const response = shell.exec(shellCmd)
  // console.log('Cucumber response: ' + response)
  return response
}
