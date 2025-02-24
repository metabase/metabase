import * as fs from "fs";

import * as path from "path";

import {
  EMBEDDING_SDK_DIST_PATH,
  LOCAL_DIST_PATH,
  METABASE_JAR_DIST_PATH,
} from "../constants/local-dist-data";
import type { EmbeddingSdkVersion } from "../types";

import { logWithPrefix } from "./log-with-prefix";

function copyLocalMetabaseJar({
  rootPath,
  loggerPrefix,
}: {
  rootPath: string;
  loggerPrefix: string;
}) {
  const metabaseJarFromPath = METABASE_JAR_DIST_PATH;
  const metabaseJarToPath = path.join(rootPath, LOCAL_DIST_PATH);

  logWithPrefix(
    `Copying ${metabaseJarFromPath} to ${metabaseJarToPath}...`,
    loggerPrefix,
  );

  fs.rmSync(metabaseJarToPath, { force: true, recursive: true });
  fs.cpSync(metabaseJarFromPath, metabaseJarToPath, {
    force: true,
    recursive: true,
    dereference: true,
  });
}

function copyLocalEmbeddingSdkPackage({
  rootPath,
  loggerPrefix,
}: {
  rootPath: string;
  loggerPrefix: string;
}) {
  const embeddingSdkFromPath = EMBEDDING_SDK_DIST_PATH;
  const embeddingSdkToPath = path.join(
    rootPath,
    LOCAL_DIST_PATH,
    "embedding-sdk",
  );

  logWithPrefix(
    `Copying ${embeddingSdkFromPath} to ${embeddingSdkToPath}...`,
    loggerPrefix,
  );

  fs.rmSync(embeddingSdkToPath, { force: true, recursive: true });
  fs.cpSync(embeddingSdkFromPath, embeddingSdkToPath, {
    force: true,
    recursive: true,
    dereference: true,
  });
}

export function copyResourcesToLocalDist({
  rootPath,
  embeddingSdkVersion,
  loggerPrefix,
}: {
  rootPath: string;
  embeddingSdkVersion: EmbeddingSdkVersion;
  loggerPrefix: string;
}) {
  copyLocalMetabaseJar({ rootPath, loggerPrefix });

  if (embeddingSdkVersion === "local") {
    copyLocalEmbeddingSdkPackage({ rootPath, loggerPrefix });
  }
}
