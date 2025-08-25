import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CollectionBrowser } from "embedding-sdk-bundle";
import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { collectionIdArgType } from "embedding-sdk-bundle/test/storybook-id-args";

export default {
  title: "EmbeddingSDK/CollectionBrowser",
  component: CollectionBrowser,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<ComponentProps<typeof CollectionBrowser>> = (args) => {
  return <CollectionBrowser {...args} />;
};

export const Default = {
  render: Template,

  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    collectionId: collectionIdArgType,
  },
};

export const WithTypeAndNameColumn = {
  render: Template,

  args: {
    visibleColumns: ["type", "name"],
  },
};
