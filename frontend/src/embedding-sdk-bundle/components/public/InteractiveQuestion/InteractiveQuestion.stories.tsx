import type { Meta, StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import {
  questionIdArgType,
  questionIds,
} from "embedding-sdk-bundle/test/storybook-id-args";
import { Box } from "metabase/ui";

import { InteractiveQuestion } from "./InteractiveQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || questionIds.numberId;

type InteractiveQuestionComponentProps = ComponentProps<
  typeof InteractiveQuestion
>;
export default {
  title: "EmbeddingSDK/InteractiveQuestion",
  component: InteractiveQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    questionId: questionIdArgType,
  },
  args: {
    isSaveEnabled: true,
  },
} satisfies Meta<typeof InteractiveQuestion>;

const Template: StoryFn<InteractiveQuestionComponentProps> = (args) => {
  return (
    <Box p="md">
      <InteractiveQuestion {...args} />
    </Box>
  );
};

export const Default = {
  render: Template,

  args: {
    questionId: QUESTION_ID,
    title: false,
    withAlerts: false,
    withDownloads: false,
    withChartTypeSelector: false,
  },
};

export const WithCustomTitle = {
  render: Template,

  args: {
    questionId: QUESTION_ID,
    title: "Acme Inc. Sales Report",
    withAlerts: false,
    withDownloads: false,
    withChartTypeSelector: false,
  },
};

export const WithAdditionalElements = {
  render: Template,

  args: {
    questionId: QUESTION_ID,
    title: "Acme Inc. Sales Report",
    withAlerts: false,
    withDownloads: true,
    withChartTypeSelector: true,
  },
};
