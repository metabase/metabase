import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box } from "metabase/ui";

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
    <Box p="xl">
      <CreateQuestion {...args} />
    </Box>
  );
};

export const Default = {
  render: Template,
};
