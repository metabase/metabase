import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";

import { MetabaseProvider } from "../../MetabaseProvider";

import { StaticDashboard } from "./StaticDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;
const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/StaticDashboard/public",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [getHostedBundleStoryDecorator()],
};

export const Default = () => (
  <MetabaseProvider authConfig={config}>
    <StaticDashboard dashboardId={DASHBOARD_ID} />
  </MetabaseProvider>
);
