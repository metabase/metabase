import { Question } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Flex } from "metabase/ui";

import { ChartTypeDropdown } from "./ChartTypeDropdown";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/Question/ChartTypeSelectorsList",
  component: ChartTypeDropdown,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const QuestionChartTypeSelectorList = {
  render() {
    return (
      <Box p="lg">
        <Question questionId={QUESTION_ID}>
          <Box>
            <Flex justify="space-between" w="100%">
              <Question.ChartTypeDropdown />
            </Flex>

            <Question.QuestionVisualization />
          </Box>
        </Question>
      </Box>
    );
  },
};
