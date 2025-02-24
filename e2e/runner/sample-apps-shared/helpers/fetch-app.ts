import { pipeline } from "stream/promises";

import type { IncomingMessage } from "http";
import https from "https";
import * as tar from "tar";

import { E2E_TMP_FOLDER_PATH } from "../../constants/file-system";
import type { SampleAppName } from "../types";

import { createFolder, removeFolder } from "./file-utils";
import { logWithPrefix } from "./log-with-prefix";

function getRootPath(appName: SampleAppName) {
  return `${E2E_TMP_FOLDER_PATH}/${appName}`;
}

async function downloadRepository({
  appName,
  branch,
  loggerPrefix,
}: {
  appName: SampleAppName;
  branch: string;
  loggerPrefix: string;
}): Promise<IncomingMessage> {
  const url = `https://codeload.github.com/metabase/${appName}/tar.gz/${branch}`;

  logWithPrefix(`Downloading tarball from: ${url}`, loggerPrefix);

  return new Promise((resolve, reject) => {
    https
      .get(url, response => {
        if (response.statusCode === 200) {
          resolve(response);
        } else {
          reject(`Failed to download: HTTP status code ${response.statusCode}`);
        }
      })
      .on("error", reject);
  });
}

async function extractRepository({
  response,
  destination,
  loggerPrefix,
}: {
  response: IncomingMessage;
  destination: string;
  loggerPrefix: string;
}): Promise<void> {
  logWithPrefix(`Extracting into: ${destination}`, loggerPrefix);

  await pipeline(
    response,
    tar.x({
      // Remove the top-level folder (repo/branch) when extracting
      strip: 1,
      C: destination,
    }),
  );

  logWithPrefix("Extraction complete!", loggerPrefix);
}

export async function fetchApp({
  appName,
  loggerPrefix,
  branch,
}: {
  appName: SampleAppName;
  loggerPrefix: string;
  branch: string;
}) {
  const rootPath = getRootPath(appName);

  removeFolder({ path: rootPath, loggerPrefix });
  createFolder({ path: rootPath, loggerPrefix });

  const response = await downloadRepository({ appName, branch, loggerPrefix });
  await extractRepository({
    response,
    destination: rootPath,
    loggerPrefix,
  });

  return { rootPath };
}
