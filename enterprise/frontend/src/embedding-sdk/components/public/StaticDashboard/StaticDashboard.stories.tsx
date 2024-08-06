import type { ComponentStory } from "@storybook/react";

import { StaticDashboard } from "embedding-sdk";
import { CommonStoryWrapper } from "embedding-sdk/test/common-stories-utils";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || "1";

// eslint-disable-next-line import/no-default-export
export default {
  title: "EmbeddingSDK/StaticDashboard",
  component: StaticDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonStoryWrapper],
};

const Template: ComponentStory<typeof StaticDashboard> = args => {
  return <StaticDashboard {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  dashboardId: DASHBOARD_ID,
};
