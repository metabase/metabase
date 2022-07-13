const fs = require("fs");
const chalk = require("chalk");

function printBold(message) {
  console.log(chalk.bold(message));
}

function printYellow(message) {
  console.log(chalk.yellow(message));
}

function printCyan(message) {
  console.log(chalk.cyan(message));
}

const readFile = fileName => {
  return new Promise(function (resolve, reject) {
    fs.readFile(fileName, "utf8", (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data);
    });
  });
};

module.exports = { printBold, printYellow, printCyan, readFile };
