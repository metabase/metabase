import type {
  SDKConfigWithApiKey,
  SDKConfigWithAuthProviderUri,
} from "embedding-sdk/types";

export const createMockAuthProviderUriConfig = ({
  authProviderUri = "http://TEST_URI/sso/metabase",
  ...opts
}: Partial<SDKConfigWithAuthProviderUri> = {}): SDKConfigWithAuthProviderUri => ({
  authProviderUri,
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
