const cypress = require("cypress");
const arg = require("arg");

const args = arg(
  {
    "--folder": String, // The name of the folder to run files from
    "--open": [Boolean], // Run Cypress in open mode or not? Doesn't accept additional arguments
  },
  { permissive: true }, // Passes all other flags and args to the Cypress parser
);

const folder = args["--folder"];
const isFolder = !!folder;

const supportedDatabases = ["mongo", "mysql", "postgres"];
const isQaDatabase = supportedDatabases.includes(folder);

const isOpenMode = args["--open"];
const isCI = process.env["CI"];

const parseArguments = async () => {
  const cliArgs = args._;

  // cypress.cli.parseArguments requires `cypress run` as the first two arguments
  if (cliArgs[0] !== "cypress") {
    cliArgs.unshift("cypress");
  }

  if (cliArgs[1] !== "run") {
    cliArgs.splice(1, 0, "run");
  }

  return await cypress.cli.parseRunArguments(cliArgs);
};

// This overly complicated logic will not be needed once we merge "db" specs with the rest of the "normal" Cypress files.
// Alternatively we can use the official `--project` flag to isolate "db" files but that would require a major refactor.
const getSourceFolder = () => {
  const defaultPath = `./frontend/test/metabase/scenarios/${folder}/**/*.cy.spec.js`;
  const QaDatabasePath = `./frontend/test/metabase-db/${folder}/**/*.cy.spec.js`;

  return isQaDatabase ? QaDatabasePath : defaultPath;
};

const getReporterConfig = isCI => {
  return isCI
    ? {
        reporter: "junit",
        "reporter-options": "mochaFile=cypress/results/results-[hash].xml",
      }
    : null;
};

const runCypress = async (baseUrl, exitFunction) => {
  const defaultConfig = {
    configFile: "frontend/test/__support__/e2e/cypress.json",
    config: {
      baseUrl,
    },
    spec: isFolder && getSourceFolder(),
  };

  const reporterConfig = getReporterConfig(isCI);

  const userArgs = await parseArguments();

  const finalConfig = Object.assign(
    {},
    defaultConfig,
    reporterConfig,
    userArgs,
  );

  try {
    const { status, message, totalFailed, failures } = isOpenMode
      ? await cypress.open(finalConfig)
      : await cypress.run(finalConfig);

    // At least one test failed
    if (totalFailed > 0) {
      await exitFunction(1);
    }

    // Something went wrong and Cypress failed to even run tests
    if (status === "failed" && failures) {
      console.error(message);

      await exitFunction(failures);
    }
  } catch (e) {
    console.error("Failed to run Cypress!\n", e);

    await exitFunction(1);
  }
};

module.exports = runCypress;
