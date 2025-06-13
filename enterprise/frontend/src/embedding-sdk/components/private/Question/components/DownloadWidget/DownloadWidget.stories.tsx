import { Question } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, type PopoverProps } from "metabase/ui";

import {
  DownloadWidget,
  type QuestionDownloadWidgetProps,
} from "./DownloadWidget";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/Question/DownloadWidget",
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
  render(args: QuestionDownloadWidgetProps) {
    return (
      <Box p="lg">
        <Question questionId={QUESTION_ID}>
          <Question.DownloadWidget {...args} />
        </Question>
      </Box>
    );
  },
};

export const Dropdown = {
  render(args: PopoverProps) {
    return (
      <Box p="lg">
        <Question withDownloads questionId={QUESTION_ID}>
          <Question.DownloadWidgetDropdown {...args} />
        </Question>
      </Box>
    );
  },
};
