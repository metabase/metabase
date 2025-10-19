import { exec as execCallback } from "child_process";

import { promisify } from "util";

import { safeJsonParse } from "metabase/lib/json-parse";

import { CONTAINER_NAME } from "../constants/config";

import { getCurrentDockerPort } from "./get-current-docker-port";
import { printError, printInfo } from "./print";

const exec = promisify(execCallback);

/** Container information returned by "docker ps" */
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
    printInfo(stderr);
    return null;
  }

  if (!stdout) {
    return null;
  }

  const info = safeJsonParse(stdout) as ContainerInfo;

  if (!info) {
    return null;
  }

  return { ...info, Port: getCurrentDockerPort(info.Ports) };
}
