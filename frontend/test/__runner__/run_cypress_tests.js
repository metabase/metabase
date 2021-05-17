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
const isFolderFlag = userArgs.includes("--folder");
const isSpecFlag = userArgs.includes("--spec");
const sourceFolderLocation = userArgs[userArgs.indexOf("--folder") + 1];
const specs = userArgs[userArgs.indexOf("--spec") + 1];
const isSingleSpec = !specs || !specs.match(/,/);
const testFiles = isSingleSpec ? specs : specs.split(",");

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

  const logMessage = isFolderFlag
    ? `Running tests in '${sourceFolderLocation}'`
    : `Running '${testFiles}'`;

  printBold(logMessage);

  try {
    const version = await readFile(
      __dirname + "/../../../resources/version.properties",
    );
    printBold("Running e2e test runner with this build:");
    process.stdout.write(chalk.cyan(version));
    printBold(
      "If that version seems too old, please run `./bin/build version uberjar`.\n",
    );
  } catch (e) {
    printBold(
      "No version file found. Please run `./bin/build version uberjar`.",
    );
    process.exit(1);
  }

  printBold("Starting backend");
  await BackendResource.start(server);

  printBold("Generating snapshots");
  await generateSnapshots();

  printBold("Starting Cypress");
  const baseConfig = { baseUrl: server.host };
  const folderConfig = isFolderFlag && {
    integrationFolder: sourceFolderLocation,
  };
  const specsConfig = isSpecFlag && { testFiles };
  const ignoreConfig =
    // if we're not running specific tests, avoid including db and smoketests
    folderConfig || specsConfig
      ? null
      : { ignoreTestFiles: "**/metabase-{smoketest,db}/**" };

  const config = {
    ...baseConfig,
    ...folderConfig,
    ...specsConfig,
    ...ignoreConfig,
  };
  // Cypress suggests using JSON.stringified object for more complex configuration objects
  // See: https://docs.cypress.io/guides/references/configuration#Command-Line
  const commandLineConfig = JSON.stringify(config);

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
  printBold("Cleaning up...");
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
      "frontend/test/__support__/e2e/cypress-snapshots.json",
      "--config",
      `baseUrl=${server.host}`,
    ],
    { stdio: "inherit" },
  );

  return new Promise((resolve, reject) => {
    cypressProcess.on("exit", resolve);
  });
}

function printBold(message) {
  console.log(chalk.bold(message));
}
