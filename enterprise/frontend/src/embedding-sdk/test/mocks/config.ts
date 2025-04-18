import type {
  MetabaseAuthConfigWithApiKey,
  MetabaseAuthConfigWithProvider,
} from "embedding-sdk/types";

export const createMockAuthProviderUriConfig = ({
  ...opts
}: Partial<MetabaseAuthConfigWithProvider> = {}): MetabaseAuthConfigWithProvider => ({
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
