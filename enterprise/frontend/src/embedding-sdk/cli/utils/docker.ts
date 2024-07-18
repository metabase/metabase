import { exec as execCallback } from "child_process";

import chalk from "chalk";
import { promisify } from "util";

import { getCurrentDockerPort } from "../utils/get-current-docker-port";
import { checkIsPortTaken } from "../utils/is-port-taken";
import { printError } from "../utils/print";

const exec = promisify(execCallback);

const IMAGE_NAME = "metabase/metabase:latest";
const CONTAINER_NAME = "metabase-embedding-sdk-react";

/**
 * Default port for the local Metabase instance.
 * Make sure this port is unlikely to be in use.
 */
const DEFAULT_PORT = 3366;

const messageContainerRunning = (port: number) => `
  Your local Metabase instance is already running on port ${port}.
  Use the "docker ps" command to see the Docker container's status.
`;

const messageContainerStarted = (port: number) => `
  Your local Metabase instance has been started on port ${port}.
  Use the "docker ps" command to see the Docker container's status.
`;

/**
 * Check if the Docker daemon is running.
 */
export async function checkIsDockerRunning(): Promise<boolean> {
  try {
    // `docker ps` returns an error if Docker is not running.
    const { stderr } = await exec("docker ps");

    return !stderr;
  } catch (error) {
    return false;
  }
}

/**
 * Container information returned by `docker ps`.
 */
interface ContainerInfo {
  ID: string;
  Image: string;
  Names: string;
  Ports: string; // e.g. "0.0.0.0:3366->3000/tcp"
  Port: number | null; // parsed from Ports, e.g. 3366
  State: "running" | "exited";
}

export async function getLocalMetabaseContainer(): Promise<ContainerInfo | null> {
  const { stdout, stderr } = await exec(
    `docker ps -a --format json --filter name=${CONTAINER_NAME}`,
  );

  if (stderr) {
    printError("Failed to check local container status.");
    console.log(stderr);
    return null;
  }

  if (!stdout) {
    return null;
  }

  const info = JSON.parse(stdout) as ContainerInfo;

  return { ...info, Port: getCurrentDockerPort(info.Ports) };
}

export async function stopLocalMetabaseContainer(): Promise<boolean> {
  const { stderr } = await exec(`docker stop ${CONTAINER_NAME}`);

  if (stderr) {
    printError("Failed to stop the Metabase container.");
    console.log(stderr);
    return false;
  }

  return true;
}

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1) + min);

export async function startLocalMetabaseContainer(): Promise<boolean> {
  let port = DEFAULT_PORT;

  const container = await getLocalMetabaseContainer();

  if (container) {
    if (container.Port) {
      port = container.Port;
    }

    // if the container is already running, we should just print a message.
    if (container.State === "running") {
      console.log(chalk.green(messageContainerRunning(port)));
      return true;
    }

    // if the container is exited, we should start it again.
    if (container.State === "exited") {
      const { stderr, stdout } = await exec(`docker start ${CONTAINER_NAME}`);

      // stderr may show a warning about architecture mismatch on
      // Apple Silicon, but it does not prevent the container from starting.
      if (stderr) {
        console.log(stderr);
      }

      if (stdout.trim().includes(CONTAINER_NAME)) {
        console.log(chalk.green(messageContainerStarted(port)));
        return true;
      }

      return false;
    }
  }

  // if the container has never been run before, we should run it.
  try {
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
      console.log(stderr);
    }

    if (stdout) {
      console.log(chalk.green(messageContainerStarted(port)));
      return true;
    }

    return !!stdout;
  } catch (error) {
    if (error instanceof Error) {
      printError("Failed to start Metabase.");
      console.log(error.message);
    }

    return false;
  }
}
