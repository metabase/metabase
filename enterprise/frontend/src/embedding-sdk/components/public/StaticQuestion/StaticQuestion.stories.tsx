import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  questionIdArgType,
  questionIds,
} from "embedding-sdk/test/storybook-id-args";

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
};

const Template: StoryFn<StaticQuestionComponentProps> = args => {
  return <StaticQuestion {...args} />;
};

export const Default = {
  render: Template,

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
    saveToCollectionId: undefined,
  },
};
