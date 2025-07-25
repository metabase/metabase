import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Stack } from "metabase/ui";

import { SdkQuestion } from "../../../SdkQuestion";

import { SummarizeDropdown } from "./SummarizeDropdown";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/Summarize/SummarizeDropdown",
  component: SummarizeDropdown,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const SummarizeDropdownStory = {
  render() {
    return (
      <Box p="lg">
        <SdkQuestion questionId={QUESTION_ID}>
          <Stack>
            <SdkQuestion.SummarizeDropdown />

            <SdkQuestion.QuestionVisualization />
          </Stack>
        </SdkQuestion>
      </Box>
    );
  },
};
