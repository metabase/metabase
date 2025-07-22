import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Flex } from "metabase/ui";

import { FilterDropdown } from "./FilterDropdown";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/Filter/FilterDropdown",
  component: FilterDropdown,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const FilterDropdownStory = {
  render() {
    return (
      <Box p="lg">
        <InteractiveQuestion questionId={QUESTION_ID}>
          <Box>
            <Flex justify="space-between" w="100%">
              <InteractiveQuestion.FilterDropdown />
            </Flex>

            <InteractiveQuestion.QuestionVisualization />
          </Box>
        </InteractiveQuestion>
      </Box>
    );
  },
};
