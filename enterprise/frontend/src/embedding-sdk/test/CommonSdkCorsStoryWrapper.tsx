import type { Story } from "@storybook/react";

import { MetabaseProvider, type SDKConfig } from "embedding-sdk";

const METABASE_INSTANCE_URL =
  (window as any).METABASE_INSTANCE_URL || "http://localhost:3000";

const DEFAULT_CONFIG: SDKConfig = {
  metabaseInstanceUrl: METABASE_INSTANCE_URL,
  authProviderUri: `${METABASE_INSTANCE_URL}/sso/metabase`,
};

export const CommonSdkStoryCorsWrapper = (Story: Story) => (
  <MetabaseProvider config={DEFAULT_CONFIG}>
    <Story />
  </MetabaseProvider>
);
