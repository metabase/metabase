import { exec as execCallback } from "child_process";

import { promisify } from "util";

const exec = promisify(execCallback);

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
