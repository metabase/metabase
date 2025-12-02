import type { BuildInfo } from "metabase/embedding-sdk/types/build-info";

/**
 * Puts Embedding SDK package build into the global object

 * IMPORTANT!
 * Any rename/removal change for fields is a breaking change between the SDK Bundle and the SDK NPM package,
 * and should be done via the deprecation of the field first.
 */
export function defineEmbeddingSdkPackageBuildInfo() {
  if (typeof window === "undefined") {
    return;
  }

  window.METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO = {
    version: process.env.VERSION,
    gitBranch: process.env.GIT_BRANCH,
    gitCommitSha: process.env.GIT_COMMIT_SHA,
    buildTime: process.env.BUILD_TIME,
  } satisfies BuildInfo;
}
