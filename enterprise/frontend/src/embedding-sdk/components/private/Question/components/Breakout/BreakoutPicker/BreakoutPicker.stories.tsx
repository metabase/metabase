import { Question } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box } from "metabase/ui";

import { BreakoutPicker } from ".";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/Question/Breakout/BreakoutPicker",
  component: BreakoutPicker,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const BreakoutPickerMainComponent = {
  render() {
    return (
      <Box p="lg">
        <Question questionId={QUESTION_ID}>
          <Box>
            <BreakoutPicker />
            <Question.QuestionVisualization />
          </Box>
        </Question>
      </Box>
    );
  },
};
