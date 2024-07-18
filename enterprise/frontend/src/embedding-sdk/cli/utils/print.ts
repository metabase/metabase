import chalk from "chalk";

export const printError = (message: string) =>
  console.error(chalk.red(message));

export const printSuccess = (message: string) =>
  console.log("\n  " + chalk.green(message.trim()));

export const printInfo = (message: string) =>
  console.log("\n  " + message.trim() + "\n");
