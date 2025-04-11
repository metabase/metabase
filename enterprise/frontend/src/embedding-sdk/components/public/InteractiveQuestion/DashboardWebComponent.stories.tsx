import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";
import "./web";

// Shared configuration
const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;
const config = getStorybookSdkAuthConfigForUser("admin");
window.fetchRequestToken = config.fetchRequestToken;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/WebComponent/Dashboard",
  component: "mb-dashboard",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <mb-provider
        metabase-instance-url={config.metabaseInstanceUrl}
        auth-provider-uri={config.authProviderUri}
        fetch-request-token="fetchRequestToken"
      >
        <Story />
      </mb-provider>
    ),
  ],
};

export const Dashboard = (args) => (
  <div style={{ background: `var(--mb-background-color)` }}>
    <mb-dashboard dashboard-id={DASHBOARD_ID} />;
  </div>
);
Dashboard.args = {};

export const Open = (args) => <mb-dashboard-open dashboard-id={DASHBOARD_ID} />;

export const Closed = (args) => (
  <mb-dashboard-closed dashboard-id={DASHBOARD_ID} />
);
