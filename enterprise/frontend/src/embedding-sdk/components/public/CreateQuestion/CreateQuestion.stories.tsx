import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { CreateQuestion } from "./CreateQuestion";

type CreateQuestionComponentProps = ComponentProps<typeof CreateQuestion>;

export default {
  title: "EmbeddingSDK/CreateQuestion",
  component: CreateQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<CreateQuestionComponentProps> = (args) => {
  return <CreateQuestion {...args} />;
};

export const Default = {
  render: Template,
};
