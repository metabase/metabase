// Provide custom afterAll implementation for letting shared-resouce.js set method for doing cleanup
let jasmineAfterAllCleanup = async () => {}
global.afterAll = (method) => { jasmineAfterAllCleanup = method; }

import { exec, spawn } from "child_process";

// use require for BackendResource to run it after the mock afterAll has been set
const BackendResource = require("./e2e/support/backend.js").BackendResource
const server = BackendResource.get({});

const init = async() => {
    await BackendResource.start(server)

    const userArgs = process.argv.slice(2);
    const env = {
        ...process.env,
        "E2E_HOST": process.env.E2E_HOST || server.host
    }

    const jestProcess = spawn(
        "yarn",
        ["run", "jest", "--", "--config", "jest.integ.conf.json", ...userArgs],
        {
            env,
            stdio: "inherit"
        }
    );

    return new Promise((resolve, reject) => {
        jestProcess.on('exit', () => { resolve(); })
    })
}

const cleanup = async () => {
    await jasmineAfterAllCleanup();
    await BackendResource.stop(server);
    process.exit(0);
}

init()
    .then(cleanup)
    .catch((e) => {
        throw e;
        cleanup();
    });

process.on('SIGTERM', () => {
    cleanup();
})