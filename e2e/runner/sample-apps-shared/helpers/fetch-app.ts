import fs from "fs";

import path from "path";

import { shell } from "../../cypress-runner-utils";

const E2E_TMP_FOLDER_PATH = path.resolve(__dirname, "../../../tmp");

export function fetchApp({
  appName,
  branch,
}: {
  appName: string;
  branch: string;
}) {
  const rootPath = `${E2E_TMP_FOLDER_PATH}/${appName}`;

  fs.rmSync(rootPath, { recursive: true, force: true });
  fs.mkdirSync(rootPath, { recursive: true });

  const url = `https://codeload.github.com/metabase/${appName}/tar.gz/${branch}`;

  console.log(`Downloading and extracting from: ${url}`);
  console.log(`Extracting into: ${rootPath}`);

  const command = `curl -L ${url} | tar -xz --strip-components=1 -C ${rootPath}`;

  try {
    shell(command, { cwd: rootPath });
    console.log("Extraction complete!");
  } catch (error) {
    console.error("Failed to download and extract:", error);
    throw error;
  }

  return { rootPath };
}
