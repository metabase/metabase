import type { PackageJson } from "@package-json/types";

import { EMBEDDING_SDK_PACKAGE_NAME } from "../constants/embedding-sdk-package-name";
import type { EmbeddingSdkVersion } from "../types";

import { logWithPrefix } from "./log-with-prefix";
import { updatePackageJsonFile } from "./package-json-utils";

function setEmbeddingSdkVersion({
  packageJsonContent,
  embeddingSdkVersion,
  loggerPrefix,
}: {
  packageJsonContent: Partial<PackageJson>;
  embeddingSdkVersion: EmbeddingSdkVersion;
  loggerPrefix: string;
}) {
  if (
    embeddingSdkVersion &&
    embeddingSdkVersion !== "local" &&
    packageJsonContent.dependencies?.[EMBEDDING_SDK_PACKAGE_NAME]
  ) {
    logWithPrefix(
      `Setting ${EMBEDDING_SDK_PACKAGE_NAME} to version ${embeddingSdkVersion} in package.json file...`,
      loggerPrefix,
    );

    packageJsonContent.dependencies[EMBEDDING_SDK_PACKAGE_NAME] =
      embeddingSdkVersion;
  }

  return packageJsonContent;
}

export function preparePackageJson({
  installationPath,
  embeddingSdkVersion,
  loggerPrefix,
}: {
  installationPath: string;
  embeddingSdkVersion: EmbeddingSdkVersion;
  loggerPrefix: string;
}) {
  updatePackageJsonFile(installationPath, packageJsonContent => {
    packageJsonContent = setEmbeddingSdkVersion({
      packageJsonContent,
      embeddingSdkVersion,
      loggerPrefix,
    });

    return packageJsonContent;
  });
}
