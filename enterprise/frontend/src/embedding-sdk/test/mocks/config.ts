import type { SDKConfig } from "embedding-sdk/types";

export const createMockConfig = ({
  jwtProviderUri,
  ...opts
}: {
  jwtProviderUri: SDKConfig["jwtProviderUri"];
} & Partial<SDKConfig>): SDKConfig => ({
  jwtProviderUri,
  metabaseInstanceUrl: "http://localhost",
  ...opts,
});
