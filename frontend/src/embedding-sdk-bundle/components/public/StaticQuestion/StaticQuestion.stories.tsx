import type { Meta, StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import {
  questionIdArgType,
  questionIds,
} from "embedding-sdk-bundle/test/storybook-id-args";
import { Box } from "metabase/ui";

import { StaticQuestion } from "./StaticQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || questionIds.numberId;

type StaticQuestionComponentProps = ComponentProps<typeof StaticQuestion>;

export default {
  title: "EmbeddingSDK/StaticQuestion",
  component: StaticQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    questionId: questionIdArgType,
  },
} satisfies Meta<typeof StaticQuestion>;

const Template: StoryFn<StaticQuestionComponentProps> = (args) => {
  return (
    <Box p="md">
      <StaticQuestion {...args} />
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
