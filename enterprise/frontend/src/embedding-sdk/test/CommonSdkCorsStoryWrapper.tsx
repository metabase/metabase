import type { Story } from "@storybook/react";

import { type MetabaseAuthConfig, MetabaseProvider } from "embedding-sdk";

const METABASE_INSTANCE_URL =
  (window as any).METABASE_INSTANCE_URL || "http://localhost:3000";

const DEFAULT_AUTH_CONFIG: MetabaseAuthConfig = {
  metabaseInstanceUrl: METABASE_INSTANCE_URL,
  authProviderUri: `${METABASE_INSTANCE_URL}/sso/metabase`,
};

export const CommonSdkStoryCorsWrapper = (Story: Story) => (
  <MetabaseProvider authConfig={DEFAULT_AUTH_CONFIG}>
    <Story />
  </MetabaseProvider>
);
