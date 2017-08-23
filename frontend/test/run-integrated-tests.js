// Provide custom afterAll implementation for letting shared-resouce.js set method for doing cleanup
let jasmineAfterAllCleanup = async () => {}
global.afterAll = (method) => { jasmineAfterAllCleanup = method; }

import { spawn } from "child_process";

// use require for BackendResource to run it after the mock afterAll has been set
const BackendResource = require("./legacy-selenium/support/backend.js").BackendResource

const serverWithTestDbFixture = BackendResource.get({});
const testFixtureBackendHost = serverWithTestDbFixture.host;

const serverWithPlainDb = BackendResource.get({ dbKey: "" });
const plainBackendHost = serverWithPlainDb.host;

const login = async (apiHost) => {
    const loginFetchOptions = {
        method: "POST",
        headers: new Headers({
            "Accept": "application/json",
            "Content-Type": "application/json"
        }),
        body: JSON.stringify({ username: "bob@metabase.com", password: "12341234"})
    };
    const result = await fetch(apiHost + "/api/session", loginFetchOptions);

    let resultBody = null
    try {
        resultBody = await result.text();
        resultBody = JSON.parse(resultBody);
    } catch (e) {}

    if (result.status >= 200 && result.status <= 299) {
        console.log(`Successfully created a shared login with id ${resultBody.id}`)
        return resultBody
    } else {
        const error = {status: result.status, data: resultBody }
        console.log('A shared login attempt failed with the following error:');
        console.log(error, {depth: null});
        throw error
    }
}

const init = async() => {
    await BackendResource.start(serverWithTestDbFixture)
    await BackendResource.start(serverWithPlainDb)

    const sharedLoginSession = await login(testFixtureBackendHost)

    const env = {
        ...process.env,
        "TEST_FIXTURE_BACKEND_HOST": testFixtureBackendHost,
        "PLAIN_BACKEND_HOST": plainBackendHost,
        "TEST_FIXTURE_SHARED_LOGIN_SESSION_ID": sharedLoginSession.id
    }
    const userArgs = process.argv.slice(2);
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
    await BackendResource.stop(serverWithTestDbFixture);
    await BackendResource.stop(serverWithPlainDb);
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