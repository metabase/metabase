import type { StoryFn } from "@storybook/react";

import { ComponentProvider } from "embedding-sdk/components/public";
import type { MetabaseAuthConfig } from "embedding-sdk/types";

const METABASE_INSTANCE_URL =
  (window as any).METABASE_INSTANCE_URL || "http://localhost:3000";

const DEFAULT_AUTH_CONFIG: MetabaseAuthConfig = {
  metabaseInstanceUrl: METABASE_INSTANCE_URL,
};

export const CommonSdkStoryCorsWrapper = (Story: StoryFn) => (
  <ComponentProvider authConfig={DEFAULT_AUTH_CONFIG}>
    <Story />
  </ComponentProvider>
);
