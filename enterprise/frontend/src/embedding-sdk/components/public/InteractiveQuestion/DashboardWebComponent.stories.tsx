import type { StoryFn } from "@storybook/react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import "./web";

// Shared configuration
const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;
const config = getStorybookSdkAuthConfigForUser("admin");
(window as any).fetchRequestToken = config.fetchRequestToken;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/WebComponent/Dashboard",
  component: "mb-dashboard",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story: StoryFn) => (
      <mb-provider
        metabase-instance-url={config.metabaseInstanceUrl}
        fetch-request-token="fetchRequestToken"
      >
        <Story />
      </mb-provider>
    ),
  ],
};

export const Dashboard = () => <mb-dashboard dashboard-id={DASHBOARD_ID} />;
Dashboard.args = {};

export const Open = () => <mb-dashboard-open dashboard-id={DASHBOARD_ID} />;

export const Closed = () => <mb-dashboard-closed dashboard-id={DASHBOARD_ID} />;
