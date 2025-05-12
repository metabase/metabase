import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Stack } from "metabase/ui";

import { QuestionSettings } from "./QuestionSettings";

const QUESTION_ID = (window as any).QUESTION_ID || 11;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/QuestionSettings",
  component: QuestionSettings,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const Default = {
  render() {
    return (
      <Box p="lg">
        <InteractiveQuestion questionId={QUESTION_ID}>
          <Stack>
            <InteractiveQuestion.QuestionSettings />
            <InteractiveQuestion.QuestionVisualization />
          </Stack>
        </InteractiveQuestion>
      </Box>
    );
  },
};
