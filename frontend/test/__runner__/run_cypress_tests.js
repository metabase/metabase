<<<<<<< HEAD
import { spawn } from "child_process";

const getVersion = require("./cypress-runner-get-version");
const { printBold, printYellow } = require("./cypress-runner-utils");
=======
const { printBold } = require("./cypress-runner-utils");
const runCypress = require("./cypress-runner-run-tests");
const getVersion = require("./cypress-runner-get-version");
const generateSnapshots = require("./cypress-runner-generate-snapshots");
>>>>>>> tags/v0.41.0

// Use require for BackendResource to run it after the mock afterAll has been set
const BackendResource = require("./backend.js").BackendResource;

const server = BackendResource.get({ dbKey: "" });
<<<<<<< HEAD

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
=======
const baseUrl = server.host;
>>>>>>> tags/v0.41.0

const init = async () => {
  printBold("Metabase version info");
  await getVersion();

  printBold("Starting backend");
  await BackendResource.start(server);

  printBold("Generating snapshots");
  await generateSnapshots(baseUrl, cleanup);

  printBold("Starting Cypress");
<<<<<<< HEAD
  if (!isOpenMode) {
    printYellow(
      "If you are developing locally, prefer using `yarn test-cypress-open` instead.\n",
    );
  }

  const logMessage = isFolderFlag
    ? `Running tests in '${sourceFolderLocation}'`
    : `Running '${testFiles}'`;

  printBold(logMessage);
  const baseConfig = { baseUrl: server.host };
  const folderConfig = isFolderFlag && {
    integrationFolder: sourceFolderLocation,
  };
  const specsConfig = isSpecFlag && { testFiles };
  const ignoreConfig =
    // if we're not running specific tests, avoid including db tests
    folderConfig || specsConfig
      ? null
      : { ignoreTestFiles: "**/metabase-db/**" };

  const config = {
    ...baseConfig,
    ...folderConfig,
    ...specsConfig,
    ...ignoreConfig,
  };
  // Cypress suggests using JSON.stringified object for more complex configuration objects
  // See: https://docs.cypress.io/guides/references/configuration#Command-Line
  const commandLineConfig = JSON.stringify(config);

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
    ],
    { stdio: "inherit" },
  );

  return new Promise((resolve, reject) => {
    cypressProcess.on("exit", resolve);
  });
=======
  await runCypress(baseUrl, cleanup);
>>>>>>> tags/v0.41.0
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
<<<<<<< HEAD

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
=======
>>>>>>> tags/v0.41.0
