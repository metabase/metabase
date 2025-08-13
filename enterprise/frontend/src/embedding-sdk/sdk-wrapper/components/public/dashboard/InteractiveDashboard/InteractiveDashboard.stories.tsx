import { getHostedBundleStoryDecorator } from "embedding-sdk/sdk-wrapper/test/getHostedBundleStoryDecorator";
import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { MetabaseProvider } from "../../MetabaseProvider";

import { InteractiveDashboard } from "./InteractiveDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;
const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/InteractiveDashboard/public",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [getHostedBundleStoryDecorator()],
};

export const Default = () => (
  <MetabaseProvider authConfig={config}>
    <InteractiveDashboard dashboardId={DASHBOARD_ID} />
  </MetabaseProvider>
);
