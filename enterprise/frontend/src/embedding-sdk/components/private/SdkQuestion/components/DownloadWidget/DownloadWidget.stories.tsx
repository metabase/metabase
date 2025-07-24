import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, type PopoverProps } from "metabase/ui";

import { DownloadWidget, type DownloadWidgetProps } from "./DownloadWidget";

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
  render(args: DownloadWidgetProps) {
    return (
      <Box p="lg">
        <SdkQuestion questionId={QUESTION_ID}>
          <SdkQuestion.DownloadWidget {...args} />
        </SdkQuestion>
      </Box>
    );
  },
};

export const Dropdown = {
  render(args: PopoverProps) {
    return (
      <Box p="lg">
        <SdkQuestion withDownloads questionId={QUESTION_ID}>
          <SdkQuestion.DownloadWidgetDropdown {...args} />
        </SdkQuestion>
      </Box>
    );
  },
};
