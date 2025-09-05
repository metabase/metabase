import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { BuildInfo } from "metabase/embedding-sdk/types/build-info";

export const getBuildInfo = (
  target:
    | "METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO"
    | "METABASE_EMBEDDING_SDK_BUNDLE_BUILD_INFO",
): BuildInfo => {
  const buildInfo = getWindow()?.[target];

  return {
    version: buildInfo?.version,
    gitBranch: buildInfo?.gitBranch,
    gitCommitSha: buildInfo?.gitCommitSha,
    buildTime: buildInfo?.buildTime,
  };
};
