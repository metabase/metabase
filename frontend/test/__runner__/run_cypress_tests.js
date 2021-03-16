import { spawn } from "child_process";
import fs from "fs";
import chalk from "chalk";

// Use require for BackendResource to run it after the mock afterAll has been set
const BackendResource = require("./backend.js").BackendResource;

const server = BackendResource.get({ dbKey: "" });

// We currently accept three (optional) command line arguments
// --open - Opens the Cypress test browser
// --folder <path> - Specifies a different path for the integration folder
// --spec <single-spec-path> - Specifies a path to a single test file
const userArgs = process.argv.slice(2);
const isOpenMode = userArgs.includes("--open");
const sourceFolder = userArgs.includes("--folder");
const singleFile = userArgs.includes("--spec");
const sourceFolderLocation = userArgs[userArgs.indexOf("--folder") + 1];
const singleFileName = userArgs[userArgs.indexOf("--spec") + 1];

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

  if (sourceFolder) {
    console.log(chalk.bold(`Running tests in '${sourceFolderLocation}'`));
  }

  if (singleFile) {
    console.log(chalk.bold(`Running single spec '${singleFileName}'`));
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
  if (sourceFolder) {
    commandLineConfig = `${commandLineConfig},integrationFolder=${sourceFolderLocation}`;
  } else if (singleFile) {
    commandLineConfig = `${commandLineConfig},testFiles=${singleFileName}`;
  } else {
    // if we're not running specific tests, avoid including db and smoketests
    commandLineConfig = `${commandLineConfig},ignoreTestFiles=**/metabase-{smoketest,db}/**`;
  }

  // These env vars provide the token to the backend.
  // If they're not present, we skip some tests that depend on a valid token.
  const hasEnterpriseToken =
    process.env["ENTERPRISE_TOKEN"] && process.env["MB_EDITION"] === "ee";

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
          ]
        : []),
      ...(hasEnterpriseToken ? ["--env", "HAS_ENTERPRISE_TOKEN=true"] : []),
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
