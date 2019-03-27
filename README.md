To simulate call to Lambda function locally
`$ ./node_modules/lambda-local/bin/lambda-local -l handler.js -e api-gw-event.json -h handler -E {\"S3_BUCKET_NAME\":\"cucumber-files\"} -t 20`

To run cucumber locally
`$ ./node_modules/.bin/cucumber-js --format json`