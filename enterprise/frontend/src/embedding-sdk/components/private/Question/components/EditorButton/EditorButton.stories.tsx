import { Question } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box } from "metabase/ui";

import { EditorButton, type QuestionEditorButtonProps } from "./EditorButton";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/Question/EditorButton",
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
  render(args: QuestionEditorButtonProps) {
    return (
      <Box p="lg">
        <Question questionId={QUESTION_ID}>
          <Question.EditorButton {...args} />
        </Question>
      </Box>
    );
  },
};
