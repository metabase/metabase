import { Question } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Flex } from "metabase/ui";

import { Breakout } from "./Breakout";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/Question/Breakout/Breakout",
  component: Breakout,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const BreakoutMainComponent = {
  render() {
    return (
      <Box p="lg">
        <Question questionId={QUESTION_ID}>
          <Box>
            <Flex justify="space-between" w="100%">
              <Question.Breakout />
            </Flex>

            <Question.QuestionVisualization />
          </Box>
        </Question>
      </Box>
    );
  },
};
