import type { StoryFn } from "@storybook/react-webpack5";

import { StaticDashboard } from "embedding-sdk-bundle/components/public/dashboard";
import { CommonSdkStoryCorsWrapper } from "embedding-sdk-bundle/test/CommonSdkCorsStoryWrapper";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;

export default {
  title: "EmbeddingSDK/CypressStaticDashboardWithCors",
  component: StaticDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryCorsWrapper],
};

const Template: StoryFn<typeof StaticDashboard> = (args) => {
  return <StaticDashboard {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  dashboardId: DASHBOARD_ID,
};
