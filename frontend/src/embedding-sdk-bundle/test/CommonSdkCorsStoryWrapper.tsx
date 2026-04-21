import type { StoryFn } from "@storybook/react";

// To run initialization side effects like Mantine styles, dayjs plugins, etc
import "embedding-sdk-bundle";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types";

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
