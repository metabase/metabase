import fs from "fs";

import { logWithPrefix } from "./log-with-prefix";

export function createFolder({
  path,
  loggerPrefix,
}: {
  path: string;
  loggerPrefix: string;
}) {
  if (!fs.existsSync(path)) {
    logWithPrefix(`Creating folder: ${path}`, loggerPrefix);

    fs.mkdirSync(path, { recursive: true });
  }
}

export function removeFolder({
  path,
  loggerPrefix,
}: {
  path: string;
  loggerPrefix: string;
}) {
  logWithPrefix(`Removing folder: ${path}`, loggerPrefix);

  fs.rmSync(path, { recursive: true, force: true });
}
