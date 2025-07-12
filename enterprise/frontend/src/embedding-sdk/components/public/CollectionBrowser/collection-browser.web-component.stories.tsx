import type { StoryFn } from "@storybook/react";
import { useEffect, useRef } from "react";

import type { CollectionBrowserWebComponentProps } from "embedding-sdk";
import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";
import type { MetabaseCollectionItem } from "embedding-sdk/types/collection";

import "../metabase-provider.web-component";
import "./collection-browser.web-component";

const COLLECTION_ID = "root";
const config = getStorybookSdkAuthConfigForUser("admin");
(window as any).fetchRequestToken = config.fetchRequestToken;

(window as any).onCollectionClick = (collection: MetabaseCollectionItem) => {
  // eslint-disable-next-line no-console
  console.log(collection);
};

export default {
  title: "EmbeddingSDK/CollectionBrowser/web-component",
  component: "collection-browser",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story: StoryFn) => (
      <metabase-provider
        metabase-instance-url={config.metabaseInstanceUrl}
        fetch-request-token="fetchRequestToken"
      >
        <Story />
      </metabase-provider>
    ),
  ],
};

export const CollectionBrowser = () => (
  <collection-browser
    collection-id={COLLECTION_ID}
    on-click="onCollectionClick"
  />
);

export const CollectionBrowserWithDefinedProperties = () => {
  const ref = useRef<HTMLElement & CollectionBrowserWebComponentProps>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    ref.current.onClick = (window as any).onCollectionClick;
  }, []);

  return <collection-browser ref={ref} collection-id={COLLECTION_ID} />;
};
