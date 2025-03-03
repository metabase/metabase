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

export function updateJsonFile<
  TContent extends Record<string, any> = Record<string, any>,
>(filePath: string, updateFunction: (jsonContent: TContent) => TContent) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = JSON.parse(fs.readFileSync(filePath, "utf8")) as TContent;

  const updatedContent = updateFunction(content);

  fs.writeFileSync(filePath, JSON.stringify(updatedContent, null, 2), "utf8");
}
