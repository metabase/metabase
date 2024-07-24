import type { ComponentStory } from "@storybook/react";

import { StaticDashboard } from "embedding-sdk";
import { CommonStoryWrapper } from "embedding-sdk/test/common-stories-utils";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || "1";

// eslint-disable-next-line import/no-default-export
export default {
  title: "EmbeddingSDK/StaticDashboard",
  component: StaticDashboard,
};

const Template: ComponentStory<typeof StaticDashboard> = args => {
  return (
    <CommonStoryWrapper>
      <StaticDashboard {...args} />
    </CommonStoryWrapper>
  );
};

export const Default = Template.bind({});
Default.args = {
  dashboardId: DASHBOARD_ID,
};
