import chalk from "chalk";

const PADDING = "\n  ";

export const printError = (message: string) =>
  console.error(PADDING + chalk.red(message.trimStart()));

export const printSuccess = (message: string) =>
  console.log(PADDING + chalk.green(message.trimStart()));

export const printInfo = (message: string) =>
  console.log(PADDING + message.trimStart());
