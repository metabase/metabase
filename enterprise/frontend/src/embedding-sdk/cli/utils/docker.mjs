// @ts-check

import { exec as execCallback } from "child_process";

import chalk from "chalk";
import { promisify } from "util";

import { getCurrentDockerPort } from "./get-current-docker-port.mjs";
import { checkIsPortTaken } from "./is-port-taken.mjs";
import { printError, printInfo, printSuccess } from "./print.mjs";

const exec = promisify(execCallback);

const IMAGE_NAME = "metabase/metabase-enterprise:latest";
export const CONTAINER_NAME = "metabase-enterprise-embedding";

/**
 * Default port for the local Metabase instance.
 * Make sure this port is unlikely to be in use.
 */
const DEFAULT_PORT = 3366;

/** @param {number} port */
const messageContainerRunning = port =>
  `Your local Metabase instance is already running on port ${port}.
  Use the "docker ps" command to see the Docker container's status.`;

/** @param {number} port */
const messageContainerStarted =
  port => `Your local Metabase instance has been started on port ${port}.
  Use the "docker ps" command to see the Docker container's status.`;

const CONTAINER_CHECK_MESSAGE =
  "Checking if Metabase is already running in a Docker container...";

/**
 * Check if the Docker daemon is running.
 *
 * @returns {Promise<boolean>}
 */
export async function checkIsDockerRunning() {
  try {
    // `docker ps` returns an error if Docker is not running.
    const { stderr } = await exec("docker ps");

    return !stderr;
  } catch (error) {
    return false;
  }
}

export async function getLocalMetabaseContainer() {
  const { stdout, stderr } = await exec(
    `docker ps -a --format json --filter name=${CONTAINER_NAME}`,
  );

  if (stderr) {
    printError("Failed to check local container status.");
    printInfo(stderr);
    return null;
  }

  if (!stdout) {
    return null;
  }

  const info = JSON.parse(stdout);

  return { ...info, Port: getCurrentDockerPort(info.Ports) };
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

/** @returns {Promise<number|false>} */
export async function startLocalMetabaseContainer() {
  let port = DEFAULT_PORT;

  printInfo(chalk.grey(CONTAINER_CHECK_MESSAGE));

  const container = await getLocalMetabaseContainer();

  if (container) {
    if (container.Port) {
      port = container.Port;
    }

    // if the container is already running, we should just print a message.
    if (container.State === "running") {
      printSuccess(messageContainerRunning(port));
      return port;
    }

    // if the container is exited, we should start it again.
    if (container.State === "exited") {
      const { stderr, stdout } = await exec(`docker start ${CONTAINER_NAME}`);

      // stderr may show a warning about architecture mismatch on
      // Apple Silicon, but it does not prevent the container from starting.
      if (stderr) {
        printInfo(chalk.grey(stderr.trim()));
      }

      if (stdout.trim().includes(CONTAINER_NAME)) {
        printSuccess(messageContainerStarted(port));
        return port;
      }

      return false;
    }
  }

  // if the container has never been run before, we should run it.
  try {
    printInfo("Starting Metabase in a Docker container...");

    // If the port is already taken, we should try another port.
    while (await checkIsPortTaken(port)) {
      console.log(
        chalk.yellow(`Port ${port} is already taken. Trying another port...`),
      );

      port = randInt(3000, 3500);
    }

    const { stderr, stdout } = await exec(
      `docker run --detach -p ${port}:3000 --name ${CONTAINER_NAME} ${IMAGE_NAME}`,
    );

    // stderr may show a warning about architecture mismatch on
    // Apple Silicon, but it does not prevent the container from starting.
    if (stderr) {
      printInfo(chalk.grey(stderr.trim()));
    }

    if (stdout) {
      printSuccess(messageContainerStarted(port));
      return port;
    }

    return false;
  } catch (error) {
    if (error instanceof Error) {
      printError("Failed to start Metabase.");
      console.log(error.message);
    }

    return false;
  }
}
