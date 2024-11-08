import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button, Popover } from "metabase/ui";

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
    return (
      <Box p="lg">
        <InteractiveQuestion questionId={QUESTION_ID}>
          <Box>
            <Popover width={300} position="bottom-start">
              <Popover.Target>
                <Button>Filter</Button>
              </Popover.Target>

              <Popover.Dropdown>
                <InteractiveQuestion.FilterPicker withIcon />
              </Popover.Dropdown>
            </Popover>

            <InteractiveQuestion.QuestionVisualization />
          </Box>
        </InteractiveQuestion>
      </Box>
    );
  },
};
