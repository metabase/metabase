import type {
  MetabaseAuthConfig,
  MetabaseAuthConfigWithApiKey,
} from "embedding-sdk-bundle/types";

import { MOCK_INSTANCE_URL } from "./sso";

export const createMockSdkConfig = (
  opts: Partial<MetabaseAuthConfig> = {},
): MetabaseAuthConfig => ({
  metabaseInstanceUrl: MOCK_INSTANCE_URL,
  ...opts,
});

export const createMockApiKeyConfig = ({
  apiKey = "TEST_API_KEY",
  ...opts
}: Partial<MetabaseAuthConfigWithApiKey> = {}): MetabaseAuthConfigWithApiKey => ({
  apiKey,
  metabaseInstanceUrl: MOCK_INSTANCE_URL,
  ...opts,
});
