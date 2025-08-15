import { getHostedBundleStoryDecorator } from "embedding-sdk/sdk-package/test/getHostedBundleStoryDecorator";
import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";
import type { MetabaseCollectionItem } from "embedding-sdk/types";

import { MetabaseProvider } from "../MetabaseProvider";

import { CollectionBrowser } from "./CollectionBrowser";

const COLLECTION_ID = "root";
const config = getStorybookSdkAuthConfigForUser("admin");

(window as any).onCollectionClick = (collection: MetabaseCollectionItem) => {
  // eslint-disable-next-line no-console
  console.log(collection);
};

export default {
  title: "EmbeddingSDK/CollectionBrowser/public",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [getHostedBundleStoryDecorator()],
};

export const Default = () => (
  <MetabaseProvider authConfig={config}>
    <CollectionBrowser
      collectionId={COLLECTION_ID}
      onClick={(collection: MetabaseCollectionItem) => {
        // eslint-disable-next-line no-console
        console.log(collection);
      }}
    />
  </MetabaseProvider>
);
