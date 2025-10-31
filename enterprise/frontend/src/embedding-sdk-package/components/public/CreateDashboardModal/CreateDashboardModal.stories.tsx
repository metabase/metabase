import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import type { MetabaseDashboard } from "embedding-sdk-bundle/types/dashboard";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";

import { MetabaseProvider } from "../MetabaseProvider";

import { CreateDashboardModal } from "./CreateDashboardModal";

const COLLECTION_ID = "root";
const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/CreateDashboardModal/public",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [getHostedBundleStoryDecorator()],
};

export const Default = () => (
  <MetabaseProvider authConfig={config}>
    <CreateDashboardModal
      initialCollectionId={COLLECTION_ID}
      onCreate={(dashboard: MetabaseDashboard) => {
        // eslint-disable-next-line no-console
        console.log(dashboard);
      }}
    />
  </MetabaseProvider>
);
