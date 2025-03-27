import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  questionIdArgType,
  questionIds,
} from "embedding-sdk/test/storybook-id-args";
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
    questionId: questionIdArgType,
  },
};

const Template: StoryFn<InteractiveQuestionComponentProps> = (args) => {
  return (
    <Box bg="var(--mb-color-background)" mih="100vh">
      <InteractiveQuestion {...args} />
    </Box>
  );
};

export const Default = {
  render: Template,

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
    targetCollection: undefined,
    title: true,
    withResetButton: true,
  },
};

export const EditorOnly = {
  render(args: InteractiveQuestionComponentProps) {
    return (
      <Box bg="var(--mb-color-background)" mih="100vh">
        <InteractiveQuestion {...args}>
          <InteractiveQuestion.Editor />
        </InteractiveQuestion>
      </Box>
    );
  },

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
    targetCollection: undefined,
  },
};

export const CreateQuestion = {
  render(args: InteractiveQuestionComponentProps) {
    return (
      <Box bg="var(--mb-color-background)" mih="100vh">
        <InteractiveQuestion {...args} />
      </Box>
    );
  },
  args: { questionId: "new" },
};
