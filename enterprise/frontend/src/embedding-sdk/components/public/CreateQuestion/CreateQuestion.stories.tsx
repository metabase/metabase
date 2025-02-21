import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Flex } from "metabase/ui";

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

const Template: StoryFn<CreateQuestionComponentProps> = args => {
  return (
    <Flex p="xl">
      <CreateQuestion {...args} />
    </Flex>
  );
};

export const Default = {
  render: Template,
};
