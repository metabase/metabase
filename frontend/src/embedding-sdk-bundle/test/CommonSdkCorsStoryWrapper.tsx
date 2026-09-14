import type { StoryFn } from "@storybook/react";

// To run initialization side effects like Mantine styles, dayjs plugins, etc
import "embedding-sdk-bundle";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types";
import { STORYBOOK_METABASE_INSTANCE_URL } from "embedding-sdk-shared/.storybook/constants";

const DEFAULT_AUTH_CONFIG: MetabaseAuthConfig = {
  metabaseInstanceUrl: STORYBOOK_METABASE_INSTANCE_URL,
};

export const CommonSdkStoryCorsWrapper = (Story: StoryFn) => (
  <ComponentProvider authConfig={DEFAULT_AUTH_CONFIG}>
    <Story />
  </ComponentProvider>
);
