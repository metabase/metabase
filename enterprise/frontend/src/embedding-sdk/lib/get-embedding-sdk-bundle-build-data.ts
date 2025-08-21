import type { BuildInfo } from "metabase/embedding-sdk/types/build-info";

export const getEmbeddingSdkBundleBuildData = (
  version: string | undefined,
): BuildInfo => ({
  version,
  gitBranch: process.env.GIT_BRANCH,
  gitCommit: process.env.GIT_COMMIT,
  buildTime: process.env.BUILD_TIME,
});
