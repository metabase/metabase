import type { ComponentStory } from "@storybook/react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { EditableDashboard } from "./EditableDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;

export default {
  title: "EmbeddingSDK/EditableDashboard",
  component: EditableDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

const Template: ComponentStory<typeof EditableDashboard> = args => {
  return <EditableDashboard {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  dashboardId: DASHBOARD_ID,
};
