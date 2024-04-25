const { exec } = require("child_process");

const arg = require("arg");
const chalk = require("chalk");
const cypress = require("cypress");

function printBold(message) {
  console.log(chalk.bold(message));
}

function printYellow(message) {
  console.log(chalk.yellow(message));
}

function printCyan(message) {
  console.log(chalk.cyan(message));
}

function executeYarnCommand({ command, message } = {}) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(stderr);

        reject(error);
        return;
      }

      printBold(message);

      resolve(stdout);
    });
  });
}

const args = arg(
  {
    "--folder": String, // The name of the folder to run files from
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
  printYellow,
  printCyan,
  executeYarnCommand,
  parseArguments,
  args,
};
