// Provide custom afterAll implementation for letting shared-resouce.js set method for doing cleanup
let jasmineAfterAllCleanup = async () => {}
global.afterAll = (method) => { jasmineAfterAllCleanup = method; }

import { spawn } from "child_process";

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
        ["run", "jest", "--", "--maxWorkers=1", "--config", "jest.integ.conf.json", ...userArgs],
        {
            env,
            stdio: "inherit"
        }
    );

    return new Promise((resolve, reject) => {
        jestProcess.on('exit', resolve)
    })
}

const cleanup = async (exitCode = 0) => {
    await jasmineAfterAllCleanup();
    await BackendResource.stop(server);
    process.exit(exitCode);
}

init()
    .then(cleanup)
    .catch((e) => {
        console.error(e);
        cleanup(1);
    });

process.on('SIGTERM', () => {
    cleanup();
})