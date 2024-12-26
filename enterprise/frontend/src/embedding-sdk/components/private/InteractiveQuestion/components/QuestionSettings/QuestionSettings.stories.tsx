import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button, Popover } from "metabase/ui";

import { QuestionSettings } from "./QuestionSettings";

const QUESTION_ID = (window as any).QUESTION_ID || 11;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/QuestionSettings",
  component: QuestionSettings,
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
            <Popover>
              <Popover.Target>
                <Button>Open Settings</Button>
              </Popover.Target>
              <Popover.Dropdown>
                <InteractiveQuestion.QuestionSettings />
              </Popover.Dropdown>
            </Popover>
            <InteractiveQuestion.QuestionVisualization />
          </Box>
        </InteractiveQuestion>
      </Box>
    );
  },
};
