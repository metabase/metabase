import chalk from "chalk";

const availableColors = [
  chalk.red,
  chalk.green,
  chalk.blue,
  chalk.yellow,
  chalk.magenta,
  chalk.cyan,
];
const loggerPrefixColorMap = new Map();

function getRandomColor() {
  return availableColors[Math.floor(Math.random() * availableColors.length)];
}

export function logWithPrefix(message: string, loggerPrefix: string) {
  if (!loggerPrefixColorMap.has(loggerPrefix)) {
    loggerPrefixColorMap.set(loggerPrefix, getRandomColor());
  }

  const chalkColorFunction = loggerPrefixColorMap.get(loggerPrefix);

  console.log(
    `${chalk.bold(chalkColorFunction(loggerPrefix))}: ${message.trim()}`,
  );
}
