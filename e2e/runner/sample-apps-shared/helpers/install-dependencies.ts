import fs from "fs";

import { detect } from "detect-package-manager";
import path from "path";

import { EMBEDDING_SDK_DIST_PATH } from "../../constants/file-system";
import { EMBEDDING_SDK_PACKAGE_NAME } from "../constants/embedding-sdk-package-name";
import type { EmbeddingSdkVersion } from "../types";

import { logWithPrefix } from "./log-with-prefix";
import { updatePackageLockFile } from "./package-json-utils";
import { preparePackageJson } from "./prepare-package-json";
import { spawnPromise } from "./spawn-promise";

function removeEmbeddingSdkEntryFromPackageLock(installationPath: string) {
  updatePackageLockFile(installationPath, packageLockContent => {
    delete packageLockContent.packages[
      `node_modules/${EMBEDDING_SDK_PACKAGE_NAME}`
    ];

    return packageLockContent;
  });
}

// Installation via `file://` behaves differently between `npm` and `yarn`, also it causes some issues with `Vite`.
// It's easier just to clone the local dist of Embedding SDK, instead of trying to install it from the local path.
function copyLocalEmbeddingSdkPackage({
  installationPath,
  loggerPrefix,
}: {
  installationPath: string;
  loggerPrefix: string;
}) {
  const embeddingSdkFromPath = EMBEDDING_SDK_DIST_PATH;
  const embeddingSdkToPath = path.join(
    installationPath,
    "node_modules",
    EMBEDDING_SDK_PACKAGE_NAME,
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

async function installUsingNpm({
  loggerPrefix,
  installationPath,
  embeddingSdkVersion,
}: {
  loggerPrefix: string;
  installationPath: string;
  embeddingSdkVersion: EmbeddingSdkVersion;
}) {
  if (embeddingSdkVersion) {
    // To avoid warnings about version mismatch
    removeEmbeddingSdkEntryFromPackageLock(installationPath);
  }

  await spawnPromise({
    cmd: "npm",
    args: ["install"],
    options: {
      cwd: installationPath,
    },
    loggerPrefix,
  });
}

async function installUsingYarn({
  loggerPrefix,
  installationPath,
}: {
  loggerPrefix: string;
  installationPath: string;
}) {
  await spawnPromise({
    cmd: "yarn",
    args: ["install"],
    options: {
      cwd: installationPath,
    },
    loggerPrefix,
  });
}

export async function installDependencies({
  installationPath,
  embeddingSdkVersion,
  loggerPrefix,
}: {
  installationPath: string;
  embeddingSdkVersion: EmbeddingSdkVersion;
  loggerPrefix: string;
}) {
  logWithPrefix(
    `Installing dependencies in: ${installationPath} ...`,
    loggerPrefix,
  );

  const manager = await detect({ cwd: installationPath });

  preparePackageJson({ installationPath, embeddingSdkVersion, loggerPrefix });

  switch (manager) {
    case "npm":
      await installUsingNpm({
        loggerPrefix,
        installationPath,
        embeddingSdkVersion,
      });
      break;
    case "yarn":
      await installUsingYarn({ loggerPrefix, installationPath });
      break;
    default:
      await installUsingYarn({ loggerPrefix, installationPath });
  }

  if (embeddingSdkVersion === "local") {
    copyLocalEmbeddingSdkPackage({ installationPath, loggerPrefix });
  }

  logWithPrefix("Dependencies installed successfully.", loggerPrefix);
}
