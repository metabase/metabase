import type { StoryFn } from "@storybook/react";

import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Stack } from "metabase/ui";

import {
  InteractiveDashboard,
  type InteractiveDashboardProps,
} from "./InteractiveDashboard";

const ENTITY_ID = "xBLdW9FsgRuB2HGhWiBa_";
const ONE_TOO_MANY_ENTITY_ID = ENTITY_ID + "1";
const WRONG_ENTITY_ID = ENTITY_ID.slice(0, -1) + "1";
const NUMBER_ID = 1;
const WRONG_NUMBER_ID = 99999999;

const DASHBOARD_ID = ENTITY_ID;

export default {
  title: "EmbeddingSDK/InteractiveDashboard",
  component: InteractiveDashboard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    dashboardId: {
      options: [
        ENTITY_ID,
        ONE_TOO_MANY_ENTITY_ID,
        WRONG_ENTITY_ID,
        NUMBER_ID,
        WRONG_NUMBER_ID,
      ],
      control: {
        type: "select",
        labels: {
          [ENTITY_ID]: "Entity ID",
          [ONE_TOO_MANY_ENTITY_ID]: "One Too Many Entity ID",
          [WRONG_ENTITY_ID]: "Wrong Entity ID",
          [NUMBER_ID]: "Number ID",
          [WRONG_NUMBER_ID]: "Wrong Number ID",
        },
      },
    },
  },
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
