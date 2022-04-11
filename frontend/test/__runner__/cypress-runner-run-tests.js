const { patch } = require("cy2");
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

const getSourceFolder = folder => {
  return `./frontend/test/metabase/scenarios/${folder}/**/*.cy.spec.js`;
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
  /**
   * We need to patch CYPRESS_API_URL with cy2 in order to use currents.dev dashboard for recording.
   * This is applicable only when you explicitly use the `--record` flag, with the provided `--key`.
   */
  try {
    patch("https://cy.currents.dev");
  } catch (e) {
    console.error("Failed to patch Cypress!\n", e);

    await exitFunction(1);
  }

  const defaultConfig = {
    browser: "chrome",
    configFile: "frontend/test/__support__/e2e/cypress.json",
    config: {
      baseUrl,
    },
    spec: isFolder && getSourceFolder(folder),
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
