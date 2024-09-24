import type { ComponentStory } from "@storybook/react";

import { StaticDashboard } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || "1";

export default {
  title: "EmbeddingSDK/StaticDashboard",
  component: StaticDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

const Template: ComponentStory<typeof StaticDashboard> = args => {
  return <StaticDashboard {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  dashboardId: DASHBOARD_ID,
};
