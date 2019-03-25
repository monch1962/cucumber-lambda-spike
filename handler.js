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
  if (s3bucket !== '') {
    // Copy step files from S3 bucket to Lambda's own filesystem
    const s3files = s3filelist(s3bucket)
    copyFromS3(s3bucket, s3files)
  }

  const featureFilename = saveEventFeatureToFile(event)
  console.log('Feature file: ' + featureFilename)

  const cucumberResult = executeCucumber(featureFilename)

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless v1.0! Your function executed successfully!',
      input: event,
      output: cucumberResult
    })
  }

  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // return { message: 'Go Serverless v1.0! Your function executed successfully!', event };

  // TODO: Return http 501 (Not Implemented) if Cucumber steps haven't been implemented yet
}

const s3filelist = (s3bucket) => {
  var fileList = []
  S3.listObjectsV2({ Bucket: s3bucket, MaxKeys: 1000 }).forEach(element => {
    fileList.append(element.Key)
  })
  return fileList
}

const copyFromS3 = (s3bucket, fileList) => {
  const fs = require('fs')
  const path = require('path')
  fileList.forEach(file => {
    var params = {
      Bucket: s3bucket,
      Key: file
    }
    var localFilename = path.join('/tmp/', file)
    var localFile = fs.createWriteStream(localFilename)
    S3.getObject(params).createReadStream().pipe(localFile)
  })
}

const saveEventFeatureToFile = (event) => {
  const fs = require('fs')
  const tmp = require('tmp')
  const tmpobj = tmp.fileSync({ postfix: '.feature' })
  const featureJSON = fs.readFileSync('./event.json')
  const feature = JSON.parse(featureJSON).feature
  console.log('Feature: ' + feature)
  fs.writeFileSync(tmpobj.name, feature, 'utf8')
  return tmpobj.name
}

const executeCucumber = (featureFilename) => {
  const shellCmd = './node_modules/.bin/cucumber-js ' + featureFilename
  var response = shell.exec(shellCmd)
  return response
}
