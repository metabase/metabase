const { execSync } = require("child_process");

const arg = require("arg");
const chalk = require("chalk");
const cypress = require("cypress");

function printBold(message) {
  console.log(`\n${chalk.bold(chalk.magenta(message.trim()))}\n`);
}

async function parseArguments() {
  const rawArguments = arg(
    {
      "--open": [Boolean], // Run Cypress in open mode or not? Doesn't accept additional arguments
    },
    { permissive: true }, // Passes all other flags and args to the Cypress parser
  );
  const cliArgs = rawArguments._;

  // cypress.cli.parseArguments requires `cypress run` as the first two arguments
  if (cliArgs[0] !== "cypress") {
    cliArgs.unshift("cypress");
  }

  if (cliArgs[1] !== "run") {
    cliArgs.splice(1, 0, "run");
  }

  const parsedArguments = await cypress.cli.parseRunArguments(cliArgs);

  return { rawArguments, parsedArguments };
}

function shell(command, { quiet = false } = {}) {
  const output = execSync(command, { stdio: quiet ? "pipe" : "inherit" });
  return output?.toString()?.trim();
}

function stringToBoolean(value) {
  if (value === "true" || value === "false") {
    return value === "true";
  }
  return value;
}

function booleanToString(value) {
  if (typeof value === "boolean") {
    return String(value);
  }
  return value;
}

function booleanify(map) {
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key, stringToBoolean(value)]),
  );
}

function unBooleanify(map) {
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key, booleanToString(value)]),
  );
}

module.exports = {
  booleanify,
  unBooleanify,
  parseArguments,
  printBold,
  shell,
};
