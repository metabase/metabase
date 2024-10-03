import type { Story } from "@storybook/react";

import { MetabaseProvider, type SDKConfig } from "embedding-sdk";

const METABASE_INSTANCE_URL =
  (window as any).METABASE_INSTANCE_URL || "http://localhost:3000";
const METABASE_API_KEY = (window as any).METABASE_API_KEY || "";

const DEFAULT_CONFIG: SDKConfig = {
  metabaseInstanceUrl: METABASE_INSTANCE_URL,
  apiKey: METABASE_API_KEY,
};

export const CommonSdkStoryApiKeyWrapper = (Story: Story) => (
  <MetabaseProvider config={DEFAULT_CONFIG}>
    <Story />
  </MetabaseProvider>
);
