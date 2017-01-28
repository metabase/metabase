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

// Console spec reporter
import { SpecReporter } from "jasmine-spec-reporter";
jasmine.getEnv().addReporter(new SpecReporter());

// JUnit XML reporter for CircleCI
import { JUnitXmlReporter } from "jasmine-reporters";
jasmine.getEnv().addReporter(new JUnitXmlReporter({
    savePath: (process.env["CIRCLE_TEST_REPORTS"] || ".") + "/test-report-e2e",
    consolidateAll: false
}));

// HACK to enable jasmine.getEnv().currentSpec
jasmine.getEnv().addReporter({
    specStarted(result) {
        jasmine.getEnv().currentSpecResult = result;
    },
    specDone() {
        jasmine.getEnv().currentSpecResult = null;
    }
});
