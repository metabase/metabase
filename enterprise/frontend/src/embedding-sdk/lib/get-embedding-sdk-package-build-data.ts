import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";

export const EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION = "unknown";

export const getEmbeddingSdkPackageBuildData = () =>
  getWindow()?.METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO ?? null;
