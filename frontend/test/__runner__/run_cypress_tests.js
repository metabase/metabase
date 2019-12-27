import { spawn } from "child_process";
import fs from "fs";
import chalk from "chalk";

// Use require for BackendResource to run it after the mock afterAll has been set
const BackendResource = require("./backend.js").BackendResource;

const server = BackendResource.get({ dbKey: "" });

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

  console.log(chalk.bold("Starting backend"));
  await BackendResource.start(server);

  console.log(chalk.bold("Starting Cypress"));
  const cypressProcess = spawn(
    "yarn",
    [
      "cypress",
      isOpenMode ? "open" : "run",
      "--config-file",
      process.env["CONFIG_FILE"],
      "--config",
      `baseUrl=${server.host}`,
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
