import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { InteractiveQuestion } from "./InteractiveQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

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
    title: {
      options: [
        undefined,
        true,
        false,
        "Custom Title",
        "Long title".repeat(10),
      ],
      control: { type: "radio" },
    },
  },
};

const Template: StoryFn<InteractiveQuestionComponentProps> = args => {
  return <InteractiveQuestion {...args} />;
};

export const Default = {
  render: Template,

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
    saveToCollectionId: undefined,
    title: true,
    withResetButton: true,
  },
};

export const EditorOnly = {
  render(args: InteractiveQuestionComponentProps) {
    return (
      <InteractiveQuestion {...args}>
        <InteractiveQuestion.Editor />
      </InteractiveQuestion>
    );
  },

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
    saveToCollectionId: undefined,
  },
};
