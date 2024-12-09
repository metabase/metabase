import type {
  MetabaseAuthConfigWithApiKey,
  MetabaseAuthConfigWithProvider,
} from "embedding-sdk/types";

export const createMockAuthProviderUriConfig = ({
  authProviderUri = "http://TEST_URI/sso/metabase",
  ...opts
}: Partial<MetabaseAuthConfigWithProvider> = {}): MetabaseAuthConfigWithProvider => ({
  authProviderUri,
  metabaseInstanceUrl: "http://localhost",
  ...opts,
});

export const createMockApiKeyConfig = ({
  apiKey = "TEST_API_KEY",
  ...opts
}: Partial<MetabaseAuthConfigWithApiKey> = {}): MetabaseAuthConfigWithApiKey => ({
  apiKey,
  metabaseInstanceUrl: "http://localhost",
  ...opts,
});
