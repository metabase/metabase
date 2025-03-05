import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box } from "metabase/ui";

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
        <InteractiveQuestion questionId={QUESTION_ID}>
          <InteractiveQuestion.DownloadWidget {...args} />
        </InteractiveQuestion>
      </Box>
    );
  },
};
