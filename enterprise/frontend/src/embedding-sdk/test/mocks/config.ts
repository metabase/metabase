import type {
  MetabaseAuthConfig,
  MetabaseAuthConfigWithApiKey,
} from "embedding-sdk/types";

export const createMockSdkConfig = (
  opts: Partial<MetabaseAuthConfig> = {},
): MetabaseAuthConfig => ({
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
