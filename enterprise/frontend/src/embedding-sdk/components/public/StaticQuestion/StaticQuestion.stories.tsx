import type { StoryFn } from "@storybook/react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { StaticQuestion, type StaticQuestionProps } from "./StaticQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/StaticQuestion",
  component: StaticQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<StaticQuestionProps> = args => (
  <StaticQuestion {...args} />
);

export const Default = {
  render: Template,
  args: { questionId: QUESTION_ID },
};
