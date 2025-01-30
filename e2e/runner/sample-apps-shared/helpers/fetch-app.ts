import type { IncomingMessage } from "http";
import https from "https";
import path from "path";
import * as tar from "tar";

import { E2E_TMP_FOLDER_PATH } from "../../constants/file-system";
import type { SampleAppName } from "../types";

import { createFolder, removeFolder } from "./file-utils";
import { logWithPrefix } from "./log-with-prefix";

function getRootPath(appName: SampleAppName, subAppName?: string) {
  return `${E2E_TMP_FOLDER_PATH}/${[appName, subAppName].filter(Boolean).join("-")}`;
}

function downloadRepository({
  appName,
  branch,
  loggerPrefix,
}: {
  appName: SampleAppName;
  branch: string;
  loggerPrefix: string;
}) {
  const url = `https://codeload.github.com/metabase/${appName}/tar.gz/${branch}`;

  logWithPrefix(`Downloading tarball from: ${url}`, loggerPrefix);

  return new Promise<IncomingMessage>((resolve, reject) => {
    https
      .get(url, response => {
        if (response.statusCode !== 200) {
          reject(`Failed to download: HTTP status code ${response.statusCode}`);
        }

        resolve(response);
      })
      .on("error", reject);
  });
}

function extractRepository({
  response,
  destination,
  loggerPrefix,
}: {
  response: IncomingMessage;
  destination: string;
  loggerPrefix: string;
}) {
  logWithPrefix(`Extracting into: ${destination}`, loggerPrefix);

  return new Promise<void>((resolve, reject) => {
    response
      .pipe(
        tar.x({
          // Remove the top-level folder with repo/branch name
          strip: 1,
          C: destination,
        }),
      )
      .on("finish", () => {
        logWithPrefix("Extraction complete!", loggerPrefix);

        resolve();
      })
      .on("error", reject);
  });
}

export async function fetchApp({
  appName,
  subAppName,
  loggerPrefix,
  branch,
}: {
  appName: SampleAppName;
  subAppName?: string;
  loggerPrefix: string;
  branch: string;
}) {
  const rootPath = getRootPath(appName, subAppName);
  const installationPath = subAppName
    ? path.join(rootPath, subAppName)
    : rootPath;

  removeFolder({ path: rootPath, loggerPrefix });
  createFolder({ path: rootPath, loggerPrefix });

  const response = await downloadRepository({ appName, branch, loggerPrefix });
  await extractRepository({
    response,
    destination: rootPath,
    loggerPrefix,
  });

  return { rootPath, installationPath };
}
