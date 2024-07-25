import { exec as execCallback } from "child_process";

import chalk from "chalk";
import ora from "ora";
import { promisify } from "util";

import { CONTAINER_NAME, IMAGE_NAME } from "./constants";
import { getCurrentDockerPort } from "./get-current-docker-port";
import { checkIsPortTaken } from "./is-port-taken";
import { printError, printInfo, printSuccess } from "./print";
import { SITE_NAME } from "./setup-metabase-instance";

const exec = promisify(execCallback);

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
 * Use the same setup token for every demo instances.
 * This makes it easy to configure across runs.
 */
export const EMBEDDING_DEMO_SETUP_TOKEN =
  "2a29948a-ed75-490e-9391-a22690fa5a76";

const METABASE_INSTANCE_DEFAULT_ENVS: Record<string, string> = {
  MB_SITE_NAME: SITE_NAME,
  MB_EMBEDDING_APP_ORIGIN: "http://localhost:*",
  MB_ENABLE_EMBEDDING: "true",
  MB_EMBEDDING_HOMEPAGE: "visible",
  MB_SETUP_TOKEN: EMBEDDING_DEMO_SETUP_TOKEN,
};

/** Container information returned by "docker ps" */
interface ContainerInfo {
  ID: string;
  Image: string;
  Names: string;
  Ports: string; // e.g. "0.0.0.0:3366->3000/tcp"
  Port: number | null; // parsed from Ports, e.g. 3366
  State: "running" | "exited";
}

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

export async function getLocalMetabaseContainer(): Promise<ContainerInfo | null> {
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

  const info = JSON.parse(stdout) as ContainerInfo;

  return { ...info, Port: getCurrentDockerPort(info.Ports) };
}

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1) + min);

export async function startLocalMetabaseContainer(): Promise<number | false> {
  let port = DEFAULT_PORT;

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

      if (stdout.trim().includes(CONTAINER_NAME)) {
        printSuccess(messageContainerStarted(port));
        return port;
      }

      if (stderr) {
        printInfo(chalk.grey(stderr.trim()));
      }

      return false;
    }
  }

  const spinner = ora("Starting Metabase in a Docker container.").start();

  // if the container has never been run before, we should run it.
  try {
    // If the port is already taken, we should try another port.
    while (await checkIsPortTaken(port)) {
      console.log(
        chalk.yellow(`Port ${port} is already taken. Trying another port...`),
      );

      port = randInt(3000, 3500);
    }

    // Pass default configuration as environment variables
    const envFlags = Object.entries(METABASE_INSTANCE_DEFAULT_ENVS)
      .map(([key, value]) => `-e ${key}='${value}'`)
      .join(" ");

    const { stderr, stdout } = await exec(
      `docker run --detach -p ${port}:3000 ${envFlags} --name ${CONTAINER_NAME} ${IMAGE_NAME}`,
    );

    if (stdout) {
      spinner.succeed();
      printSuccess(messageContainerStarted(port));
      return port;
    }

    spinner.fail();

    if (stderr) {
      printInfo(chalk.grey(stderr.trim()));
    }

    return false;
  } catch (error) {
    spinner.fail();

    if (error instanceof Error) {
      printError("Failed to start Metabase.");
      console.log(error.message);
    }

    return false;
  }
}
