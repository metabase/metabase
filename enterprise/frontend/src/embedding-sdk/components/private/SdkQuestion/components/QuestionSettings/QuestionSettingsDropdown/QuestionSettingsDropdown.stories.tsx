import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Stack } from "metabase/ui";

import { QuestionSettingsDropdown } from "./QuestionSettingsDropdown";

const QUESTION_ID = (window as any).QUESTION_ID || 11;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/QuestionSettingsDropdown",
  component: QuestionSettingsDropdown,
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
            <Box>
              <SdkQuestion.QuestionSettingsDropdown />
            </Box>
            <SdkQuestion.QuestionVisualization />
          </Stack>
        </SdkQuestion>
      </Box>
    );
  },
};
