import { useDisclosure } from "@mantine/hooks";

import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button, Flex, Popover } from "metabase/ui";

import { FilterPicker } from "./FilterPicker";
import { ChartTypeSelector, ChartTypeSelectorList } from "./ChartTypeSelector";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/ChartTypeSelector",
  component: ChartTypeSelector,
  parameters: {
    layout: "fullscreen",
  },
  // decorators: [CommonSdkStoryWrapper],
};

export const ChartTypeSelectorStory = {
  render() {

    return (
      <ChartTypeSelectorList/>
      // <Box p="lg">
      //   <InteractiveQuestion questionId={QUESTION_ID}>
      //     <InteractiveQuestion.ChartTypeSelectorList />
      //   </InteractiveQuestion>
      // </Box>
    );
  },
};
