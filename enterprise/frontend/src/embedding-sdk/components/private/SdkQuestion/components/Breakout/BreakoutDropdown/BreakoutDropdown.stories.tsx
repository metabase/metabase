import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Flex } from "metabase/ui";

import { BreakoutDropdown } from "./BreakoutDropdown";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/Breakout/BreakoutDropdown",
  component: BreakoutDropdown,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const BreakoutDropdownPicker = {
  render() {
    return (
      <Box p="lg">
        <SdkQuestion questionId={QUESTION_ID}>
          <Box>
            <Flex justify="space-between" w="100%">
              <SdkQuestion.BreakoutDropdown />
            </Flex>

            <SdkQuestion.QuestionVisualization />
          </Box>
        </SdkQuestion>
      </Box>
    );
  },
};
