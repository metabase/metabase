import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Center, Popover } from "metabase/ui";

import { SummarizePicker } from "../SummarizePicker";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/Summarize/SummarizePicker",
  component: SummarizePicker,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const SummarizePickerStory = {
  render() {
    return (
      <Center p="lg">
        <SdkQuestion questionId={QUESTION_ID}>
          {/* the point of doing this is to test the picker within the portal */}
          {/* so the styles are messed up */}
          <Popover opened={true}>
            <Popover.Target>
              <button>Open the Summarize Picker</button>
            </Popover.Target>
            <Popover.Dropdown>
              <SummarizePicker />
            </Popover.Dropdown>
          </Popover>
        </SdkQuestion>
      </Center>
    );
  },
};
