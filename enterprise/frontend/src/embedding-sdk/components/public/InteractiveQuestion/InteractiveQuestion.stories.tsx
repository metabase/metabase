import type { StoryFn } from "@storybook/react";

import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryApiKeyWrapper } from "embedding-sdk/test/CommonSdkApiKeyStoryWrapper";

import type { InteractiveQuestionProps } from "./InteractiveQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || "1";

export default {
  title: "EmbeddingSDK/InteractiveQuestion",
  component: InteractiveQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryApiKeyWrapper],
};

const Template: StoryFn<InteractiveQuestionProps> = args => {
  return <InteractiveQuestion {...args} />;
};

export const Default = {
  render: Template,

  args: {
    questionId: QUESTION_ID,
    withTitle: true,
  },
};
