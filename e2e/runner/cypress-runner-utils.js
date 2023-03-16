const { exec } = require("child_process");
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

async function parseArguments(args) {
  const cliArgs = args._;
  console.log("cliArgs");
  console.log(cliArgs);

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
};
