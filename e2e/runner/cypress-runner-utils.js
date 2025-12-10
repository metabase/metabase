const { execSync, spawn } = require("child_process");

const chalk = require("chalk");
const cypress = require("cypress");

function printBold(message) {
  console.log(`\n${chalk.bold(chalk.magenta(message.trim()))}\n`);
}

async function parseArguments(cliArgs) {
  // cypress.cli.parseArguments requires `cypress run` as the first two arguments
  if (cliArgs[0] !== "cypress") {
    cliArgs.unshift("cypress");
  }

  if (cliArgs[1] !== "run") {
    cliArgs.splice(1, 0, "run");
  }

  return await cypress.cli.parseRunArguments(cliArgs);
}

function shell(command, options = {}) {
  const { detached, quiet = false, cwd, env } = options;

  if (detached) {
    const child = spawn(command, {
      shell: true,
      detached: true,
      stdio: quiet ? "ignore" : "inherit",
      cwd,
      env: env ? { PATH: process.env.PATH, ...env } : process.env,
    });

    child.unref();

    return child.pid;
  }

  const output = execSync(command, {
    stdio: quiet ? "pipe" : "inherit",
    cwd,
    env: env
      ? {
          PATH: process.env.PATH,
          ...env,
        }
      : undefined,
  });

  return output?.toString()?.trim();
}

function stringToBoolean(value) {
  if (value === "true" || value === "false") {
    return value === "true";
  }
  return value;
}

function booleanToString(value) {
  if (typeof value === "boolean") {
    return String(value);
  }
  return value;
}

function booleanify(map) {
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key, stringToBoolean(value)]),
  );
}

function unBooleanify(map) {
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key, booleanToString(value)]),
  );
}

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function isReady(host) {
  try {
    const response = await fetch(`${host}/api/health`);
    const { status } = await response.json();
    return status === "ok";
  } catch (e) {
    return false;
  }
}

async function waitUntilReady(backend, attempt = 0) {
  const { dbFile, host } = backend;
  const TIMEOUT_MS = 1000;
  const MAX_MINUTES = 5;
  const MAX_ATTEMPTS = 60 * MAX_MINUTES;

  if (attempt === 0) {
    process.stdout.write(
      `\nWaiting for backend (host=${host}, dbFile=${dbFile})`,
    );
  }

  if (await isReady(host)) {
    console.log(`\nBackend ready host=${host}, dbFile=${dbFile}`);
    return;
  }

  if (attempt >= MAX_ATTEMPTS) {
    throw new Error(`\nBackend failed to start within ${MAX_MINUTES} minutes`);
  }

  process.stdout.write(".");
  await delay(TIMEOUT_MS);
  return waitUntilReady(backend, attempt + 1);
}

module.exports = {
  booleanify,
  unBooleanify,
  parseArguments,
  printBold,
  shell,
  delay,
  waitUntilReady,
};
