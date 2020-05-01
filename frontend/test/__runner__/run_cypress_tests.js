import { spawn } from "child_process";
import fs from "fs";
import chalk from "chalk";

// Use require for BackendResource to run it after the mock afterAll has been set
const BackendResource = require("./backend.js").BackendResource;

const server = BackendResource.get({ dbKey: "" });

// We currently accept two (optional) command line arguments
// --open - Opens the Cypress test browser
// --testFiles <path> - Specifies a different path for the integration folder
const userArgs = process.argv.slice(2);
const isOpenMode = userArgs.includes("--open");
const testFiles = userArgs.includes("--testFiles");
const testFilesLocation = userArgs[userArgs.indexOf("--testFiles") + 1];

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

const init = async () => {
  if (!isOpenMode) {
    console.log(
      chalk.yellow(
        "If you are developing locally, prefer using `yarn test-cypress-open` instead.\n",
      ),
    );
  }

  if (testFiles) {
    console.log(chalk.bold(`Running tests in '${testFilesLocation}'`));
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

  console.log(chalk.bold("Starting backend"));
  await BackendResource.start(server);

  console.log(chalk.bold("Generating snapshots"));
  await generateSnapshots();

  console.log(chalk.bold("Starting Cypress"));
  let commandLineConfig = `baseUrl=${server.host}`;
  if (testFiles) {
    commandLineConfig = `${commandLineConfig},integrationFolder=${testFilesLocation}`;
  }

  const cypressProcess = spawn(
    "yarn",
    [
      "cypress",
      isOpenMode ? "open" : "run",
      "--config-file",
      process.env["CONFIG_FILE"],
      "--config",
      commandLineConfig,
      ...(process.env["CI"]
        ? [
            "--reporter",
            "junit",
            "--reporter-options",
            "mochaFile=cypress/results/results-[hash].xml",
            "--record",
            "--parallel",
            "--group",
            process.env["CYPRESS_GROUP"],
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
  await BackendResource.stop(server);
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

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

async function generateSnapshots() {
  const cypressProcess = spawn(
    "yarn",
    [
      "cypress",
      "run",
      "--config-file",
      "frontend/test/cypress-snapshots.json",
      "--config",
      `baseUrl=${server.host}`,
    ],
    { stdio: "inherit" },
  );

  return new Promise((resolve, reject) => {
    cypressProcess.on("exit", resolve);
  });
}
