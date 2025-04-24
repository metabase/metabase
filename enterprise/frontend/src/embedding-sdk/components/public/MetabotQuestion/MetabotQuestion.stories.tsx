import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box } from "metabase/ui";

import { MetabotQuestion } from "./MetabotQuestion";

type MetabotQuestionProps = ComponentProps<typeof MetabotQuestion>;

export default {
  title: "EmbeddingSDK/MetabotQuestion",
  component: MetabotQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<MetabotQuestionProps> = () => {
  return (
    <Box
      bg="var(--mb-color-background)"
      mih="100vh"
      bd="1px solid #000"
      pt="2rem"
    >
      <MetabotQuestion />
    </Box>
  );
};

export const Default = {
  render: Template,
};
