# Spike to assess the viability of running Cucumber tests with a serverless backend

## High-level architecture
```                                 ┌───────────────────────────────────────────────┐
                                    │                 Cloud hosting                 │
                                    │                                               │
                                    │                          ┌──────────────┐     │
┌─────────────────┐                 │   ┌────────────┐         │              │     │
│                 │                 │   │  Cucumber  │         │              │     │
│  Feature file,  │                 │   │ running in │         │  Stepfiles,  │     │
│  plus optional  │─────────────────┼──▶│ serverless │────────▶│  stored in   │     │
│environment data │                 │   │  function  │         │cloud storage │     │
│                 │                 │   └────────────┘         │              │     │
└─────────────────┘                 │                          │              │     │
                                    │                          └──────────────┘     │
                                    │                                               │
                                    └───────────────────────────────────────────────┘
```
## Usage model

### Setup
- Serverless function is deployed via `$ sls deploy`, and remains in place for the duration of testing
- Automation testers create step files (written in Javascript, to use the 'serverless.js' library) and store them within git
- Manual testers create feature files `(Given...When...Then... format)` and store them within git

### Pre-execution
- Step files are copied to cloud storage

### Execution
- Automation testers POST feature files (plus any relevant environment data), expressed in JSON format, to serverless function
- Serverless function
  - parses the feature & environment data out of the POST content,
  - imports step files from cloud storage
  - executes feature file
  - returns results, expressed in JSON format, back as POST response

#### Possible variations
- Feature file is stored within TestRail, and test execution is triggered from TestRail
- Feature file is sent to serverless function via some other mechanism than http POST (e.g. SQS, SNS, Kafka, ...) and response is returned using appropriate mechanism

#### Unknowns
- Will we be able to implement browser-automation within Lambda function? If so, this is potentially an enormous benefit - no more management of Selenium Grid, Browser Stack etc. necessary

## Benefits
- _Simplicity:_ test runner (Lambda function) is deployed once at the start of testing, and left there throughout. Complexity of implementation is hidden from manual testers
- _Separation of concerns_
  - Automation testers are only responsible for step file creation & maintenance. This frees them up from execution related tasks, and potentially allows them to work across multiple projects simultaneously
  - Manual testers are responsible for feature creation & maintenance, and can take on "normal" tester responsibilities such as managing test suites, defect triage & prioritisation, progress reporting, etc.
- _Cost:_ Hosting test runner as a serverless function means near-zero ongoing cost & extremely low execution cost (i.e. pay per use), 
- _Flexibility:_ this approach leaves us free to evolve back-end implementation over time while still preserving `Given...When...Then...` interface at front-end 
- _Customer acceptance:_ our customers seem to like tests written using Cucumber

## Testing this project
To simulate call to Lambda function locally, passing in a viable feature file
`$ ./node_modules/lambda-local/bin/lambda-local -l handler.js -e api-gw-event.json -h handler -E {\"S3_BUCKET_NAME\":\"cucumber-files\"} -t 20`

To run cucumber locally
`$ ./node_modules/.bin/cucumber-js --format json`