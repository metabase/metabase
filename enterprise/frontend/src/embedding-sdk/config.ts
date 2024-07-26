import packageJson from "embedding-sdk/package.template.json";

export const DEFAULT_FONT = "Lato";
export const EMBEDDING_SDK_ROOT_ELEMENT_ID = "metabase-sdk-root";

export let EMBEDDING_SDK_VERSION = "unknown";

try {
  EMBEDDING_SDK_VERSION = packageJson?.version ?? "unknown";
} catch (e) {}
