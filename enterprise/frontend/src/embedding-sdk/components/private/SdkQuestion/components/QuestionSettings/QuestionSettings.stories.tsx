import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
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
        <SdkQuestion questionId={QUESTION_ID}>
          <Stack>
            <SdkQuestion.QuestionSettings />
            <SdkQuestion.QuestionVisualization />
          </Stack>
        </SdkQuestion>
      </Box>
    );
  },
};
