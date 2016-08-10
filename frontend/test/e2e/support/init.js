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
