import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CollectionBrowser } from "embedding-sdk-bundle/components/public/CollectionBrowser";
import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { collectionIdArgType } from "embedding-sdk-bundle/test/storybook-id-args";

export default {
  title: "EmbeddingSDK/CollectionBrowser",
  component: CollectionBrowser,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    collectionId: collectionIdArgType,
  },
};

const COLLECTION_ID = "root";

const Template: StoryFn<ComponentProps<typeof CollectionBrowser>> = (args) => {
  return <CollectionBrowser {...args} />;
};

export const Default = {
  render: Template,

  args: {
    collectionId: COLLECTION_ID,
  },
};

export const WithTypeAndNameColumn = {
  render: Template,

  args: {
    collectionId: COLLECTION_ID,
    visibleColumns: ["type", "name"],
  },
};
