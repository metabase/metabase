import { getHostedBundleStoryDecorator } from "embedding-sdk/sdk-wrapper/test/getHostedBundleStoryDecorator";
import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { MetabaseProvider } from "../../MetabaseProvider";

import { EditableDashboard } from "./EditableDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;
const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/EditableDashboard/public",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [getHostedBundleStoryDecorator()],
};

export const Default = () => (
  <MetabaseProvider authConfig={config}>
    <EditableDashboard dashboardId={DASHBOARD_ID} />
  </MetabaseProvider>
);
