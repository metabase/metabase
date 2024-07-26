import type {
  SDKConfigWithApiKey,
  SDKConfigWithJWT,
} from "embedding-sdk/types";

export const createMockJwtConfig = ({
  jwtProviderUri = "http://TEST_URI/sso/metabase",
  ...opts
}: Partial<SDKConfigWithJWT> = {}): SDKConfigWithJWT => ({
  jwtProviderUri,
  metabaseInstanceUrl: "http://localhost",
  ...opts,
});

export const createMockApiKeyConfig = ({
  apiKey = "TEST_API_KEY",
  ...opts
}: Partial<SDKConfigWithApiKey> = {}): SDKConfigWithApiKey => ({
  apiKey,
  metabaseInstanceUrl: "http://localhost",
  ...opts,
});
