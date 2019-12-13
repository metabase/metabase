import { spawn } from "child_process";
import fs from "fs";
import chalk from "chalk";

// Use require for BackendResource to run it after the mock afterAll has been set
const BackendResource = require("./backend.js").BackendResource;

// Backend that uses a test fixture database
const serverWithTestDbFixture = BackendResource.get({
  dbKey: "/cypress_db_fixture.db",
});
const testFixtureBackendHost = serverWithTestDbFixture.host;

const serverWithPlainDb = BackendResource.get({ dbKey: "" });
const plainBackendHost = serverWithPlainDb.host;

const userArgs = process.argv.slice(2);
const isOpenMode = userArgs[0] === "--open";

function readFile(fileName) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fileName, "utf8", (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data);
    });
  });
}

const login = async (apiHost, user) => {
  const loginFetchOptions = {
    method: "POST",
    headers: new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(user),
  };
  const result = await fetch(apiHost + "/api/session", loginFetchOptions);

  let resultBody = null;
  try {
    resultBody = await result.text();
    resultBody = JSON.parse(resultBody);
  } catch (e) {}

  if (result.status >= 200 && result.status <= 299) {
    console.log(`Successfully created a shared login with id ${resultBody.id}`);
    return resultBody;
  } else {
    const error = { status: result.status, data: resultBody };
    console.log("A shared login attempt failed with the following error:");
    console.log(error, { depth: null });
    throw error;
  }
};

const init = async () => {
  if (!isOpenMode) {
    console.log(
      chalk.yellow(
        "If you are developing locally, prefer using `yarn test-cypress-open` instead.\n",
      ),
    );
  }

  try {
    const version = await readFile(
      __dirname + "/../../../resources/version.properties",
    );
    console.log(chalk.bold("Running e2e test runner with this build:"));
    process.stdout.write(chalk.cyan(version));
    console.log(
      chalk.bold(
        "If that version seems too old, please run `./bin/build version uberjar`.\n",
      ),
    );
  } catch (e) {
    console.log(
      chalk.bold(
        "No version file found. Please run `./bin/build version uberjar`.",
      ),
    );
    process.exit(1);
  }

  console.log(
    chalk.bold("1/4 Starting first backend with test H2 database fixture"),
  );
  console.log(
    chalk.cyan(
      "You can update the fixture by running a local instance against it:\n`MB_DB_TYPE=h2 MB_DB_FILE=frontend/test/__runner__/cypress_db_fixture.db lein run`",
    ),
  );
  await BackendResource.start(serverWithTestDbFixture);

  console.log(chalk.bold("2/4 Starting second backend with plain database"));
  await BackendResource.start(serverWithPlainDb);

  console.log(chalk.bold("3/4 Creating a shared login session for backend 1"));
  const sharedAdminLoginSession = await login(testFixtureBackendHost, {
    username: "bob@metabase.com",
    password: "12341234",
  });
  const sharedNormalLoginSession = await login(testFixtureBackendHost, {
    username: "robert@metabase.com",
    password: "12341234",
  });

  console.log(chalk.bold("4/4 Starting Cypress"));

  const serializedEnv = Object.entries({
    TEST_FIXTURE_SHARED_ADMIN_LOGIN_SESSION_ID: sharedAdminLoginSession.id,
    TEST_FIXTURE_SHARED_NORMAL_LOGIN_SESSION_ID: sharedNormalLoginSession.id,
    PLAIN_DB_HOST: plainBackendHost,
  })
    .map(a => a.join("="))
    .join(",");

  const cypressProcess = spawn(
    "yarn",
    [
      "cypress",
      isOpenMode ? "open" : "run",
      "--config-file",
      "frontend/test/cypress.json",
      "--config",
      `baseUrl=${testFixtureBackendHost}`,
      "--env",
      serializedEnv,
      ...(process.env["CI"]
        ? [
            "--reporter",
            "junit",
            "--reporter-options",
            "mochaFile=cypress/results/results-[hash].xml",
          ]
        : []),
    ],
    { stdio: "inherit" },
  );

  return new Promise((resolve, reject) => {
    cypressProcess.on("exit", resolve);
  });
};

const cleanup = async (exitCode = 0) => {
  console.log(chalk.bold("Cleaning up..."));
  await BackendResource.stop(serverWithTestDbFixture);
  await BackendResource.stop(serverWithPlainDb);
  process.exit(exitCode);
};

const launch = () =>
  init()
    .then(cleanup)
    .catch(e => {
      console.error(e);
      cleanup(1);
    });

launch();

process.on("SIGTERM", () => {
  cleanup();
});

process.on("SIGINT", () => {
  cleanup();
});
