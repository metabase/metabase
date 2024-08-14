import { exec } from "child_process";

import { promisify } from "util";

import { IMAGE_NAME } from "../constants/config";

const execAsync = promisify(exec);

async function extractDigest(input: string): Promise<string> {
  const match = input.match(/@sha256:([a-f0-9]{64})/);

  return match ? match[1] : "";
}

async function getLocalDigest(): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `docker images --digests --format "{{.Digest}}" ${IMAGE_NAME}`,
    );

    console.log(`local-digest-stdout: ${stdout}`);

    return stdout.trim() ? await extractDigest(stdout.trim()) : null;
  } catch (error) {
    return null;
  }
}

async function getRemoteDigest(): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`docker manifest inspect ${IMAGE_NAME}`);
    console.log(`remote-digest-stdout: ${stdout}`);

    const digestLine = stdout
      .split("\n")
      .find(line => line.includes('"digest":'));

    return digestLine ? await extractDigest(digestLine) : null;
  } catch (error) {
    return null;
  }
}

export async function checkIfNewerDockerImageAvailable(): Promise<boolean> {
  const localDigest = await getLocalDigest();
  const remoteDigest = await getRemoteDigest();

  console.log(`localDigest: ${localDigest}`);
  console.log(`remoteDigest: ${remoteDigest}`);

  return localDigest === null || localDigest !== remoteDigest;
}

export async function pullLatestDockerImage(): Promise<void> {
  await execAsync(`docker pull ${IMAGE_NAME}`);
}
