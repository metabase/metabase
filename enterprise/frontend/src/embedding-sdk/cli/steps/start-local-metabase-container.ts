import { exec as execCallback } from "child_process";

import chalk from "chalk";
import ora from "ora";
import { promisify } from "util";

import {
  CONTAINER_NAME,
  DEFAULT_PORT,
  IMAGE_NAME,
} from "embedding-sdk/cli/constants/config";
import { METABASE_INSTANCE_DEFAULT_ENVS } from "embedding-sdk/cli/constants/env";
import type { CliStepMethod } from "embedding-sdk/cli/types/cli";
import { getLocalMetabaseContainer } from "embedding-sdk/cli/utils/get-local-metabase-container";
import { checkIsPortTaken } from "embedding-sdk/cli/utils/is-port-taken";
import { printInfo, printSuccess } from "embedding-sdk/cli/utils/print";

const messageContainerRunning = (port: number) => `
  Your local Metabase instance is already running on port ${port}.
  Use the "docker ps" command to see the Docker container's status.
`;

const messageContainerStarted = (port: number) => `
  Your local Metabase instance has been started on port ${port}.
  Use the "docker ps" command to see the Docker container's status.
`;

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1) + min);

const exec = promisify(execCallback);

export const startLocalMetabaseContainer: CliStepMethod = async state => {
  let port = DEFAULT_PORT;

  const container = await getLocalMetabaseContainer();

  if (container) {
    if (container.Port) {
      port = container.Port;
    }

    // if the container is already running, we should just print a message.
    if (container.State === "running") {
      printSuccess(messageContainerRunning(port));
      return [
        {
          type: "success",
        },
        { ...state, port, instanceUrl: `http://localhost:${port}` },
      ];
    }

    // if the container is exited, we should start it again.
    if (container.State === "exited") {
      const { stderr, stdout } = await exec(`docker start ${CONTAINER_NAME}`);

      if (stdout.trim().includes(CONTAINER_NAME)) {
        printSuccess(messageContainerStarted(port));
        return [
          {
            type: "success",
          },
          { ...state, port, instanceUrl: `http://localhost:${port}` },
        ];
      }

      if (stderr) {
        printInfo(chalk.grey(stderr.trim()));
      }

      return [
        {
          type: "error",
          message: "Failed to start Metabase.",
        },
        { ...state, port, instanceUrl: `http://localhost:${port}` },
      ];
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

    const envVars = {
      ...METABASE_INSTANCE_DEFAULT_ENVS,
    };

    if (state.token) {
      envVars.MB_PREMIUM_EMBEDDING_TOKEN = state.token;
    }

    // Pass default configuration as environment variables
    const envFlags = Object.entries(envVars)
      .map(([key, value]) => `-e ${key}='${value}'`)
      .join(" ");

    const { stderr, stdout } = await exec(
      `docker run --detach -p ${port}:3000 ${envFlags} --name ${CONTAINER_NAME} ${IMAGE_NAME}`,
    );

    if (stdout) {
      spinner.succeed();
      printSuccess(messageContainerStarted(port));
      return [
        {
          type: "success",
        },
        { ...state, port, instanceUrl: `http://localhost:${port}` },
      ];
    }

    spinner.fail();
    return [
      {
        type: "error",
        message: stderr.trim(),
      },
      state,
    ];
  } catch (error) {
    spinner.fail();

    return [
      {
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to start Metabase.",
      },
      state,
    ];
  }
};
