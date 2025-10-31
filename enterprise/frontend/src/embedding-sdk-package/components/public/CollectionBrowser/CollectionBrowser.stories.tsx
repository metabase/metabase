import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import type { MetabaseCollectionItem } from "embedding-sdk-bundle/types";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";

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
