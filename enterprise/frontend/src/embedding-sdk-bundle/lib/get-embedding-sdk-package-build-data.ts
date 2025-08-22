import { getWindow } from "embedding-sdk-bundle/sdk-shared/lib/get-window";
import type { BuildInfo } from "metabase/embedding-sdk/types/build-info";

export const EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION = "unknown";

export const getEmbeddingSdkPackageBuildData = (): BuildInfo => {
  const buildInfo = getWindow()?.METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO;

  return {
    version: buildInfo?.version,
    gitBranch: buildInfo?.gitBranch,
    gitCommit: buildInfo?.gitCommit,
    buildTime: buildInfo?.buildTime,
  };
};
