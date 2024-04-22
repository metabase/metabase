import type { SDKConfigType } from "embedding-sdk/types";

export const createMockConfig = ({
  authType = "apiKey",
  ...opts
}: Partial<SDKConfigType> = {}): SDKConfigType => {
  if (authType === "jwt") {
    return {
      authType,
      jwtProviderUri: "http://TEST_URI/sso/metabase",
      metabaseInstanceUrl: "http://localhost",
      ...opts,
    };
  }

  return {
    authType,
    apiKey: "TEST_API_KEY",
    metabaseInstanceUrl: "http://localhost",
    ...opts,
  };
};
