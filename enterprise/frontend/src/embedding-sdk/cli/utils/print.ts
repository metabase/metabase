import chalk from "chalk";

export const printError = (message: string) =>
  console.error(chalk.red(message));

const PADDING = "\n  ";

export const printSuccess = (message: string) =>
  console.log(PADDING + chalk.green(message.trimStart()));

export const printInfo = (message: string) =>
  console.log(PADDING + message.trimStart());
