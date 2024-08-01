import { exec as execCallback } from "child_process";

import ora from "ora";
import { promisify } from "util";

import type { CliError, CliStepMethod } from "embedding-sdk/cli/types/cli";

const exec = promisify(execCallback);
/**
 * Check if the Docker daemon is running.
 */
export const checkIsDockerRunning: CliStepMethod = async state => {
  const spinner = ora("Checking if Docker is running…").start();

  const errorResponse: CliError = {
    type: "error",
    message: "Docker is not running. Please start Docker and try again.",
  };
  try {
    // `docker ps` returns an error if Docker is not running.
    const { stderr } = await exec("docker ps");

    if (!stderr) {
      spinner.succeed("Docker is running");
      return [
        {
          type: "success",
        },
        state,
      ];
    }
    spinner.fail("Docker is not running");
    return [errorResponse, state];
  } catch (error) {
    spinner.fail("Docker is not running");
    return [errorResponse, state];
  }
};
