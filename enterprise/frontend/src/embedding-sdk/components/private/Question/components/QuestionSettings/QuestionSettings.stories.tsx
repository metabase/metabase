import { Question } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Stack } from "metabase/ui";

import { QuestionSettings } from "./QuestionSettings";

const QUESTION_ID = (window as any).QUESTION_ID || 11;

export default {
  title: "EmbeddingSDK/Question/QuestionSettings",
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
        <Question questionId={QUESTION_ID}>
          <Stack>
            <Question.QuestionSettings />
            <Question.QuestionVisualization />
          </Stack>
        </Question>
      </Box>
    );
  },
};
