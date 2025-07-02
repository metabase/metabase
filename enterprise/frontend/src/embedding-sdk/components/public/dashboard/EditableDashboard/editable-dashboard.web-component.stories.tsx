import type { StoryFn } from "@storybook/react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import "../../metabase-provider.web-component";
import "./editable-dashboard.web-component";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;
const config = getStorybookSdkAuthConfigForUser("admin");
(window as any).fetchRequestToken = config.fetchRequestToken;

export default {
  title: "EmbeddingSDK/EditableDashboard/web-component",
  component: "editable-dashboard",
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

export const Dashboard = () => (
  <editable-dashboard dashboard-id={DASHBOARD_ID} />
);
