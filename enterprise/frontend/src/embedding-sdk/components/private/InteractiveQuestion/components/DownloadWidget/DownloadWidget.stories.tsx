import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, type PopoverProps } from "metabase/ui";

import {
  DownloadWidget,
  type InteractiveQuestionDownloadWidgetProps,
} from "./DownloadWidget";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/DownloadWidget",
  component: DownloadWidget,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    isOpen: false,
  },
  decorators: [CommonSdkStoryWrapper],
};

export const Default = {
  render(args: InteractiveQuestionDownloadWidgetProps) {
    return (
      <Box p="lg">
        <InteractiveQuestion questionId={QUESTION_ID}>
          <InteractiveQuestion.DownloadWidget {...args} />
        </InteractiveQuestion>
      </Box>
    );
  },
};

export const Dropdown = {
  render(args: PopoverProps) {
    return (
      <Box p="lg">
        <InteractiveQuestion withDownloads questionId={QUESTION_ID}>
          <InteractiveQuestion.DownloadWidgetDropdown {...args} />
        </InteractiveQuestion>
      </Box>
    );
  },
};
