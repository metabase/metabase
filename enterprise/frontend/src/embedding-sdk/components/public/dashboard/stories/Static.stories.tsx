import type { StoryFn } from "@storybook/react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  dashboardIdArgType,
  dashboardIds,
} from "embedding-sdk/test/storybook-id-args";

import { type SdkDashboardProps, StaticDashboard } from "../SdkDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;

export default {
  title: "EmbeddingSDK/Dashboard/Static",
  component: StaticDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    dashboardId: dashboardIdArgType,
  },
};

const Template: StoryFn<SdkDashboardProps> = (args) => {
  return <StaticDashboard {...args} />;
};

export const Default = {
  render: Template,

  args: {
    dashboardId: DASHBOARD_ID,
    withFooter: true,
  },
};
