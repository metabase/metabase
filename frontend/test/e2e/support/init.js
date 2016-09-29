// https://github.com/matthewjh/jasmine-promises/issues/3
if (!global.jasmineRequire) {
    // jasmine 2 and jasmine promises have differing ideas on what to do inside protractor/node
    var jasmineRequire = require('jasmine-core');
    if (typeof jasmineRequire.interface !== 'function') {
        throw "not able to load real jasmineRequire"
    }
    global.jasmineRequire = jasmineRequire;
}
require('jasmine-promises');

var jasmineReporters = require('jasmine-reporters');
var junitReporter = new jasmineReporters.JUnitXmlReporter({
    savePath: (process.env["CIRCLE_TEST_REPORTS"] || ".") + "/test-report-e2e",
    consolidateAll: false
});
jasmine.getEnv().addReporter(junitReporter);
