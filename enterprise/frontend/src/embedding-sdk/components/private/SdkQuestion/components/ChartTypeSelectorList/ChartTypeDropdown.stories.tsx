import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Flex } from "metabase/ui";

import { ChartTypeDropdown } from "./ChartTypeDropdown";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/ChartTypeSelectorsList",
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
        <SdkQuestion questionId={QUESTION_ID}>
          <Box>
            <Flex justify="space-between" w="100%">
              <SdkQuestion.ChartTypeDropdown />
            </Flex>

            <SdkQuestion.QuestionVisualization />
          </Box>
        </SdkQuestion>
      </Box>
    );
  },
};
