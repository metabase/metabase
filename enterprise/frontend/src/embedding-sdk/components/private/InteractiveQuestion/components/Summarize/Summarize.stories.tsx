import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Group } from "metabase/ui";

import { Summarize } from "./Summarize";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/Summarize/Summarize",
  component: Summarize,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const SummarizeDropdownStory = {
  storyName: "Default",
  render() {
    return (
      <Box p="lg">
        <InteractiveQuestion questionId={QUESTION_ID}>
          <Group noWrap align="flex-start">
            <InteractiveQuestion.Summarize />

            <InteractiveQuestion.QuestionVisualization />
          </Group>
        </InteractiveQuestion>
      </Box>
    );
  },
};
