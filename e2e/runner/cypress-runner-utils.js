const { execSync } = require("child_process");

const arg = require("arg");
const chalk = require("chalk");
const cypress = require("cypress");

function printBold(message) {
  console.log(`\n${chalk.bold(chalk.magenta(message.trim()))}\n`);
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

function shell(command, options = {}) {
  const { quiet = false, cwd, env } = options;

  const output = execSync(command, {
    stdio: quiet ? "pipe" : "inherit",
    cwd,
    env: env
      ? {
          PATH: process.env.PATH,
          ...env,
        }
      : undefined,
  });
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

function delay(durationMs) {
  return new Promise(resolve => setTimeout(resolve, durationMs));
}

module.exports = {
  args,
  booleanify,
  unBooleanify,
  parseArguments,
  printBold,
  shell,
  delay,
};
