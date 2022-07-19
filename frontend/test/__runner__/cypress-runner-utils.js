const chalk = require("chalk");
const { exec } = require("child_process");

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

module.exports = {
  printBold,
  printYellow,
  printCyan,
  executeYarnCommand,
};
