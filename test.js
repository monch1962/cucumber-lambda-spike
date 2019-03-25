'use strict'
const lambdaLocal = require('lambda-local')
const fs = require('fs')

// var jsonPayload = {
//   'feature': 'Feature: Simple maths\r\n  In order to do maths\r\n  As a developer\r\n  I want to increment variables\r\n\r\n  Scenario: easy maths\r\n    Given a variable set to 1\r\n    When I increment the variable by 1\r\n    Then the variable should contain 2\r\n\r\n  Scenario Outline: much more complex stuff\r\n    Given a variable set to <var>\r\n    When I increment the variable by <increment>\r\n    Then the variable should contain <result>\r\n\r\n    Examples:\r\n      | var | increment | result |\r\n      | 100 |         5 |    105 |\r\n      |  99 |      1234 |   1333 |\r\n      |  12 |         5 |     18 |'
// }
var jsonPayload = fs.readFileSync('event.json', 'utf8')

lambdaLocal.execute({
  event: jsonPayload,
  lambdaPath: './handler.js',
  profilePath: '~/.aws/credentials',
  profileName: 'default',
  timeoutMs: 3000,
  handler: 'hello',
  callback: function (err, data) {
    if (err) {
      console.log(err)
    } else {
      console.log(data)
    }
  },
  clientContext: JSON.stringify({ clientId: 'xxxx' })
})
