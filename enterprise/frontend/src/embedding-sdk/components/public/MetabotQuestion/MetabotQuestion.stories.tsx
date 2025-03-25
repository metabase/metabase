import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import {
  questionIdArgType,
  questionIds,
} from "embedding-sdk/test/storybook-id-args";
import { Box } from "metabase/ui";

import { MetabotQuestion } from "./MetabotQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || questionIds.numberId;

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
    <Box bg="var(--mb-color-background)" mih="100vh">
      <MetabotQuestion visible={true} onClose={() => {}} />
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
