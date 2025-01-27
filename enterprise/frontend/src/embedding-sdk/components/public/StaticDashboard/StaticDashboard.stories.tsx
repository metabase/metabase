import type { StoryFn } from "@storybook/react";

import { StaticDashboard } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  dashboardIdArgType,
  dashboardIds,
} from "embedding-sdk/test/storybook-id-args";

import type { StaticDashboardProps } from "./StaticDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;

export default {
  title: "EmbeddingSDK/StaticDashboard",
  component: StaticDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    dashboardId: dashboardIdArgType,
  },
};

const Template: StoryFn<StaticDashboardProps> = args => {
  return <StaticDashboard {...args} />;
};

export const Default = {
  render: Template,

  args: {
    dashboardId: DASHBOARD_ID,
  },
};
