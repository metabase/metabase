import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { InteractiveQuestion } from "./InteractiveQuestion";

const NUMBER_ID = 12;
const ENTITY_ID = "VFCGVYPVtLzCtt4teeoW4";
const ONE_TOO_MANY_ENTITY_ID = ENTITY_ID + "1";
const WRONG_ENTITY_ID = ENTITY_ID.slice(0, -1) + "1";
const WRONG_NUMBER_ID = 99999999;

const QUESTION_ID = ENTITY_ID;

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
    questionId: {
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
