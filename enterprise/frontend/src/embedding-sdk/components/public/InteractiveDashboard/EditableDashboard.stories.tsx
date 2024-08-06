import type { ComponentStory } from "@storybook/react";

import { CommonStoryWrapper } from "embedding-sdk/test/common-stories-utils";

import { EditableDashboard } from "./EditableDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;

// eslint-disable-next-line import/no-default-export
export default {
  title: "EmbeddingSDK/EditableDashboard",
  component: EditableDashboard,
  parameters: {
    layout: "fullscreen",
  },
};

const Template: ComponentStory<typeof EditableDashboard> = args => {
  return (
    <CommonStoryWrapper>
      <EditableDashboard {...args} />
    </CommonStoryWrapper>
  );
};

export const Default = Template.bind({});
Default.args = {
  dashboardId: DASHBOARD_ID,
};
