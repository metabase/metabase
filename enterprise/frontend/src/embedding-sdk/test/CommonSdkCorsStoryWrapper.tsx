import type { StoryFn } from "@storybook/react";

import { type MetabaseAuthConfig, MetabaseProvider } from "embedding-sdk";

const METABASE_INSTANCE_URL =
  (window as any).METABASE_INSTANCE_URL || "http://localhost:3000";

const DEFAULT_AUTH_CONFIG: MetabaseAuthConfig = {
  metabaseInstanceUrl: METABASE_INSTANCE_URL,
};

export const CommonSdkStoryCorsWrapper = (Story: StoryFn) => (
  <MetabaseProvider authConfig={DEFAULT_AUTH_CONFIG}>
    <Story />
  </MetabaseProvider>
);
