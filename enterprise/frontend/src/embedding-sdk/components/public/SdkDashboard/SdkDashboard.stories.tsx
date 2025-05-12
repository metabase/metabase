import type { StoryFn } from "@storybook/react";

import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  dashboardIdArgType,
  dashboardIds,
} from "embedding-sdk/test/storybook-id-args";
import { Stack } from "metabase/ui";

import { SdkDashboard, type SdkDashboardProps } from "./SdkDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;

export default {
  title: "EmbeddingSDK/SdkDashboard",
  component: SdkDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    dashboardId: dashboardIdArgType,
    mode: {
      options: ["static", "interactive", "editable"],
      control: {
        type: "select",
      },
    },
  },
};

const Template: StoryFn<SdkDashboardProps> = (args) => {
  return <SdkDashboard {...args} />;
};

export const Default = {
  render: Template,

  args: {
    dashboardId: DASHBOARD_ID,
    mode: "interactive",
  },
};

export const WithCustomQuestionLayout = {
  render: Template,

  args: {
    dashboardId: DASHBOARD_ID,
    renderDrillThroughQuestion: () => (
      <Stack>
        <InteractiveQuestion.Title />
        <InteractiveQuestion.QuestionVisualization />
        <div>This is a custom question layout.</div>
      </Stack>
    ),
  },
};
