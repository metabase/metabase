import { useDisclosure } from "@mantine/hooks";

import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button, Flex, Popover } from "metabase/ui";

import { FilterPicker } from "./FilterPicker";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/FilterPicker",
  component: FilterPicker,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const PickerInPopover = {
  render() {
    const [isOpen, { close, toggle }] = useDisclosure();

    return (
      <Box p="lg">
        <InteractiveQuestion questionId={QUESTION_ID}>
          <Box>
            <Flex justify="space-between" w="100%">
              <Box>
                <InteractiveQuestion.FilterBar />
              </Box>

              <Popover position="bottom-end" opened={isOpen} onClose={close}>
                <Popover.Target>
                  <Button onClick={toggle}>Filter</Button>
                </Popover.Target>

                <Popover.Dropdown>
                  <InteractiveQuestion.FilterPicker onClose={close} withIcon />
                </Popover.Dropdown>
              </Popover>
            </Flex>

            <InteractiveQuestion.QuestionVisualization />
          </Box>
        </InteractiveQuestion>
      </Box>
    );
  },
};
