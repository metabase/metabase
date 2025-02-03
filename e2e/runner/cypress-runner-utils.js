const { execSync } = require("child_process");

const arg = require("arg");
const chalk = require("chalk");
const cypress = require("cypress");

function printBold(message) {
  console.log(`\n${chalk.bold(chalk.magenta(message))}\n`);
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

function shell(command, { quiet = process.env.QUIET } = {}) {
  const output = execSync(command, { stdio: quiet ? "pipe" : "inherit" });
  return output?.toString()?.trim();
}

module.exports = {
  printBold,
  parseArguments,
  args,
  shell,
};
