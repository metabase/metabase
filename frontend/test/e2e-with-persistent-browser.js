#!/usr/bin/env node

const exec = require('child_process').exec
const execSync = require('child_process').execSync
const fs = require('fs');
const webdriver = require('selenium-webdriver');

// User input initialization
const stdin = fs.openSync('/dev/stdin', 'rs');
const buffer = Buffer.alloc(8);

// Yarn must be executed from project root
process.chdir(__dirname + '/../..');

const url = 'http://localhost:9515';
const driverProcess = exec('chromedriver --port=9515');

const driver = new webdriver.Builder()
    .forBrowser('chrome')
    .usingServer(url)
    .build();

driver.getSession().then(function (session) {
    const id = session.getId()
    console.log('Launched persistent Webdriver session with session ID ' + id, url);

    function executeTest() {
        const hasCommandToExecuteBeforeReload =
            process.argv.length >= 4 && process.argv[2] === '--exec-before'

        if (hasCommandToExecuteBeforeReload) {
            console.log(execSync(process.argv[3]).toString())
        }

        const cmd = 'WEBDRIVER_SESSION_ID=' + id + ' WEBDRIVER_SESSION_URL=' + url + ' yarn run test-e2e';
        console.log(cmd);

        const testProcess = exec(cmd);
        testProcess.stdout.pipe(process.stdout);
        testProcess.stderr.pipe(process.stderr);
        testProcess.on('exit', function () {
            console.log("Press <Enter> to rerun tests or <C-c> to quit.")
            fs.readSync(stdin, buffer, 0, 8);
            executeTest();
        })
    }

    executeTest();
});

process.on('SIGTERM', function () {
    console.log('Shutting down...')
    driver.quit().then(function () {
        process.exit(0)
    });
    driverProcess.kill('SIGINT');
});
