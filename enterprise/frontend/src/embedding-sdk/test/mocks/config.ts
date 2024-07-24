import type { SDKConfig } from "embedding-sdk/types";

export const createMockConfig = ({
  jwtProviderUri,
  ...opts
}: {
  jwtProviderUri: string;
} & Partial<Omit<SDKConfig, "jwtProviderUri" | "apiKey">>): SDKConfig => ({
  jwtProviderUri,
  metabaseInstanceUrl: "http://localhost",
  ...opts,
});
