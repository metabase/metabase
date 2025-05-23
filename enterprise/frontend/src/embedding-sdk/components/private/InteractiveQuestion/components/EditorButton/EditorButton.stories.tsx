import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box } from "metabase/ui";

import {
  EditorButton,
  type InteractiveQuestionEditorButtonProps,
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
  render(args: InteractiveQuestionEditorButtonProps) {
    return (
      <Box p="lg">
        <InteractiveQuestion questionId={QUESTION_ID}>
          <InteractiveQuestion.EditorButton {...args} />
        </InteractiveQuestion>
      </Box>
    );
  },
};
