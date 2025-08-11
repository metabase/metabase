import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  questionIdArgType,
  questionIds,
} from "embedding-sdk/test/storybook-id-args";
import { Box } from "metabase/ui";

import { SdkQuestion } from "./SdkQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || questionIds.numberId;

type SdkQuestionComponentProps = ComponentProps<typeof SdkQuestion>;

export default {
  title: "EmbeddingSDK/SdkQuestion",
  component: SdkQuestion,
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
    entityTypes: {
      options: [
        "model",
        "table",
        "model_table",
        "empty",
        "null",
        "undefined",
        "invalid",
      ],
      mapping: {
        model: ["model"],
        table: ["table"],
        model_table: ["model", "table"],
        empty: [],
        null: null,
        undefined: undefined,
        invalid: ["metric", "question"],
      },
      control: {
        type: "select",
        labels: {
          model: "Model only",
          table: "Table only",
          model_table: "Model and Table",
        },
      },
    },
  },
};

const Template: StoryFn<SdkQuestionComponentProps> = (args) => {
  return (
    <Box bg="var(--mb-color-background)" mih="100vh">
      <SdkQuestion {...args} />
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
  render(args: SdkQuestionComponentProps) {
    return (
      <Box bg="var(--mb-color-background)" mih="100vh">
        <SdkQuestion {...args}>
          <SdkQuestion.Editor />
        </SdkQuestion>
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
  render(args: SdkQuestionComponentProps) {
    return (
      <Box bg="var(--mb-color-background)" mih="100vh">
        <SdkQuestion {...args} />
      </Box>
    );
  },
  args: {
    questionId: "new",
    entityTypes: ["model"],
  },
};
