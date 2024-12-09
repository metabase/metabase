import type { StoryFn } from "@storybook/react";

import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Stack } from "metabase/ui";

import {
  InteractiveDashboard,
  type InteractiveDashboardProps,
} from "./InteractiveDashboard";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;

export default {
  title: "EmbeddingSDK/InteractiveDashboard",
  component: InteractiveDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<InteractiveDashboardProps> = args => {
  return <InteractiveDashboard {...args} />;
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
