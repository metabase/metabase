import { tryOrDefault } from "metabase/env";

export const embeddingSdkVersion = tryOrDefault(
  () => process.env.EMBEDDING_SDK_VERSION,
  "unknown",
);

export const embeddingSdkBundleFormat = tryOrDefault(
  () => process.env.BUNDLE_FORMAT,
  "unknown",
);
