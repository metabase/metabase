const arg = require("arg");
const chalk = require("chalk");
const cypress = require("cypress");

function printBold(message) {
  console.log(chalk.bold(message));
}

const args = arg(
  {
    "--open": [Boolean], // Run Cypress in open mode or not? Doesn't accept additional arguments
  },
  { permissive: true }, // Passes all other flags and args to the Cypress parser
);

async function parseArguments(args) {
  const cliArgs = args._;

  // cypress.cli.parseArguments requires `cypress run` as the first two arguments
  if (cliArgs[0] !== "cypress") {
    cliArgs.unshift("cypress");
  }

  if (cliArgs[1] !== "run") {
    cliArgs.splice(1, 0, "run");
  }

  return await cypress.cli.parseRunArguments(cliArgs);
}

module.exports = {
  printBold,
  parseArguments,
  args,
};
