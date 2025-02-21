import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CollectionBrowser } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";

export default {
  title: "EmbeddingSDK/CollectionBrowser",
  component: CollectionBrowser,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<ComponentProps<typeof CollectionBrowser>> = args => {
  return <CollectionBrowser {...args} />;
};

export const Default = {
  render: Template,

  args: {},
};

export const WithTypeAndNameColumn = {
  render: Template,

  args: {
    visibleColumns: ["type", "name"],
  },
};
