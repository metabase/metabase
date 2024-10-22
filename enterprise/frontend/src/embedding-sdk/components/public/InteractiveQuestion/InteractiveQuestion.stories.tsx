import type { StoryFn } from "@storybook/react";

import { InteractiveQuestion } from "embedding-sdk";
import type { InteractiveQuestionProps } from "embedding-sdk/components/public/InteractiveQuestion/InteractiveQuestion";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";

const QUESTION_ID = (window as any).QUESTION_ID || 1;

export default {
  title: "EmbeddingSDK/InteractiveQuestion",
  component: InteractiveQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<InteractiveQuestionProps> = args => {
  return <InteractiveQuestion {...args} />;
};

export const Default = {
  render: Template,

  args: {
    questionId: QUESTION_ID,
  },
};
