import type { ComponentStory } from "@storybook/react";

import { CommonStoryWrapper } from "embedding-sdk/test/common-stories-utils";

import { InteractiveDashboard } from "./InteractiveDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || "1";

// eslint-disable-next-line import/no-default-export
export default {
  title: "EmbeddingSDK/InteractiveDashboard",
  component: InteractiveDashboard,
};

const Template: ComponentStory<typeof InteractiveDashboard> = args => {
  return (
    <CommonStoryWrapper>
      <InteractiveDashboard {...args} />
    </CommonStoryWrapper>
  );
};

export const Default = Template.bind({});
Default.args = {
  dashboardId: DASHBOARD_ID,
};

export const Editable = Template.bind({});
Editable.args = {
  dashboardId: DASHBOARD_ID,
  withEdit: true,
};
