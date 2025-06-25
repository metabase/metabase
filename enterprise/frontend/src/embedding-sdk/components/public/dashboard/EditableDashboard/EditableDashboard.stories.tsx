import type { StoryFn } from "@storybook/react";

import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  dashboardIdArgType,
  dashboardIds,
} from "embedding-sdk/test/storybook-id-args";
import { Stack } from "metabase/ui";

import {
  EditableDashboard,
  type EditableDashboardProps,
} from "./EditableDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;

export default {
  title: "EmbeddingSDK/EditableDashboard",
  component: EditableDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    dashboardId: dashboardIdArgType,
  },
};

const Template: StoryFn<EditableDashboardProps> = (args) => {
  return <EditableDashboard {...args} />;
};

export const Default = {
  render: Template,

  args: {
    dashboardId: DASHBOARD_ID,
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
