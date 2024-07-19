// @ts-check

import chalk from "chalk";

/** @param {string} message */
export const printError = message => console.error(chalk.red(message));

const PADDING = "\n  ";

/** @param {string} message */
export const printSuccess = message =>
  console.log(PADDING + chalk.green(message.trimStart()));

/** @param {string} message */
export const printInfo = message => console.log(PADDING + message.trimStart());
