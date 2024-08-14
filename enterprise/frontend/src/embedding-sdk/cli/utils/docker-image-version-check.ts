import { exec } from "child_process";

import { promisify } from "util";

import { IMAGE_NAME } from "../constants/config";

const execAsync = promisify(exec);

async function getLocalDigest(): Promise<string | null> {
  try {
    const command = `docker images --digests --format "{{.Digest}}" ${IMAGE_NAME}`;
    let { stdout } = await execAsync(command);

    stdout = stdout.trim();

    return stdout ?? null;
  } catch (error) {
    return null;
  }
}

async function getRemoteDigest(): Promise<string | null> {
  try {
    const command = `docker manifest inspect ${IMAGE_NAME}`;
    let { stdout } = await execAsync(command);

    stdout = stdout.trim();

    if (stdout) {
      const content = JSON.parse(stdout) as { config: { digest: string } };
      const { digest } = content.config;

      return digest;
    }

    return null;
  } catch (error) {
    return null;
  }
}

export async function checkIfNewerDockerImageAvailable(): Promise<boolean> {
  const localDigest = await getLocalDigest();
  const remoteDigest = await getRemoteDigest();

  return localDigest === null || localDigest !== remoteDigest;
}

export async function pullLatestDockerImage(): Promise<void> {
  await execAsync(`docker pull ${IMAGE_NAME}`);
}
