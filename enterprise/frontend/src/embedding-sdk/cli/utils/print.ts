import chalk from "chalk";

const MAX_WIDTH = 80;

export const OUTPUT_STYLES = {
  title: chalk.bold.bgHex("#509EE3").white,
  version: chalk.hex("#509EE3"),
  link: chalk.underline.blueBright,
  error: chalk.red.bold,
  success: chalk.green.bold,
  info: chalk.bold,
};

const _print = (style: chalk.Chalk = OUTPUT_STYLES.info, message: string) => {
  const wrappedMessage = message.replace(
    new RegExp(`(?![^\\n]{1,${MAX_WIDTH}}$)([^\\n]{1,${MAX_WIDTH}})\\s`, "g"),
    "$1\n",
  );
  console.log(style(wrappedMessage));
};

export const printEmptyLines = (count: number = 1) => {
  for (let i = 0; i < count; i++) {
    console.log();
  }
};

export const printTitle = (text: string) => {
  const padding = " ".repeat((MAX_WIDTH - text.length) / 2);

  _print(OUTPUT_STYLES.title, padding + text + padding);
};
export const printVersion = (text: string) =>
  _print(OUTPUT_STYLES.version, text);
export const printLink = (text: string) => _print(OUTPUT_STYLES.link, text);

export const printError = (message: string) =>
  console.error(OUTPUT_STYLES.error(message));

export const printSuccess = (message: string) =>
  _print(OUTPUT_STYLES.success, message);

export const printInfo = (message: string) =>
  _print(OUTPUT_STYLES.info, message);
