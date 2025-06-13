import { Question } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Group } from "metabase/ui";

import { Summarize } from "./Summarize";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/Question/Summarize/Summarize",
  component: Summarize,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const SummarizeDropdownStory = {
  name: "Default",
  render() {
    return (
      <Box p="lg">
        <Question questionId={QUESTION_ID}>
          <Group wrap="nowrap" align="flex-start">
            <Question.Summarize />

            <Question.QuestionVisualization />
          </Group>
        </Question>
      </Box>
    );
  },
};
