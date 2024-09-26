import type { ComponentStory } from "@storybook/react";

import { StaticDashboard } from "embedding-sdk";
import { CommonSdkStoryCorsWrapper } from "embedding-sdk/test/CommonSdkCorsStoryWrapper";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || "1";

export default {
  title: "EmbeddingSDK/CypressStaticDashboardWithCors",
  component: StaticDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryCorsWrapper],
};

const Template: ComponentStory<typeof StaticDashboard> = args => {
  return <StaticDashboard {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  dashboardId: DASHBOARD_ID,
};
