import type { SDKConfigType } from "embedding-sdk/types";

export const createMockConfig = ({
  ...opts
}: Partial<SDKConfigType> = {}): SDKConfigType => ({
  jwtProviderUri: "http://TEST_URI/sso/metabase",
  metabaseInstanceUrl: "http://localhost",
  ...opts,
});
