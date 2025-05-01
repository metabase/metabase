import chalk from "chalk";

export const printBold = (message) => {
  // eslint-disable-next-line no-console
  console.log(`\n${chalk.bold(chalk.magenta(message.trim()))}\n`);
};
