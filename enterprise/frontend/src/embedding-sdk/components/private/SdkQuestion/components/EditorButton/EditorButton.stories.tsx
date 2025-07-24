import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box } from "metabase/ui";

import {
  EditorButton,
  type EditorButtonProps as EditorButtonProps,
} from "./EditorButton";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/EditorButton",
  component: EditorButton,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    isOpen: false,
  },
  decorators: [CommonSdkStoryWrapper],
};

export const Default = {
  render(args: EditorButtonProps) {
    return (
      <Box p="lg">
        <SdkQuestion questionId={QUESTION_ID}>
          <SdkQuestion.EditorButton {...args} />
        </SdkQuestion>
      </Box>
    );
  },
};
