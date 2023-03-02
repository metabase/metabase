const cypress = require("cypress");
const arg = require("arg");

const { executeYarnCommand } = require("./cypress-runner-utils");

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
  return `./e2e/test/scenarios/${folder}/**/*.cy.spec.js`;
};

const runCypress = async (baseUrl, exitFunction) => {
  await executeYarnCommand({
    command: "yarn run clean-cypress-artifacts",
    message: "Removing the existing Cypress artifacts\n",
  });

  const defaultConfig = {
    browser: "chrome",
    configFile: "e2e/support/cypress.config.js",
    config: {
      baseUrl,
    },
    spec: isFolder && getSourceFolder(folder),
  };

  const userArgs = await parseArguments();

  const finalConfig = Object.assign({}, defaultConfig, userArgs);

  try {
    const { status, message, totalFailed, failures } = isOpenMode
      ? await cypress.open(finalConfig)
      : await cypress.run(finalConfig);

    // At least one test failed, so let's generate HTML report that helps us determine what went wrong
    if (totalFailed > 0) {
      await executeYarnCommand({
        command: "yarn run generate-cypress-html-report",
        message: "Generating Mochawesome HTML report\n",
      });

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
