import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { StaticQuestion } from "./StaticQuestion";

const ENTITY_ID = "evd6f3MoDUtTNsoXHwu0T";
const ONE_TOO_MANY_ENTITY_ID = ENTITY_ID + "1";
const WRONG_ENTITY_ID = ENTITY_ID.slice(0, -1) + "1";
const NUMBER_ID = 12;
const WRONG_NUMBER_ID = 99999999;

const QUESTION_ID = ENTITY_ID;

type StaticQuestionComponentProps = ComponentProps<typeof StaticQuestion>;

export default {
  title: "EmbeddingSDK/StaticQuestion",
  component: StaticQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
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
