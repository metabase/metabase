import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
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
  name: "Default",
  render() {
    return (
      <Box p="lg">
        <SdkQuestion questionId={QUESTION_ID}>
          <Group wrap="nowrap" align="flex-start">
            <SdkQuestion.Summarize />

            <SdkQuestion.QuestionVisualization />
          </Group>
        </SdkQuestion>
      </Box>
    );
  },
};
