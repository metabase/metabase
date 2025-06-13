import { Question } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Stack } from "metabase/ui";

import { SummarizeDropdown } from "./SummarizeDropdown";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/Question/Summarize/SummarizeDropdown",
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
        <Question questionId={QUESTION_ID}>
          <Stack>
            <Question.SummarizeDropdown />

            <Question.QuestionVisualization />
          </Stack>
        </Question>
      </Box>
    );
  },
};
