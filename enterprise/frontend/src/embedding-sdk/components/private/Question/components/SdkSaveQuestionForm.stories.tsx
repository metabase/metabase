import { useDisclosure } from "@mantine/hooks";
import { type ComponentProps, useState } from "react";

import { Question } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button, Modal, Stack } from "metabase/ui";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

type QuestionComponentProps = ComponentProps<typeof Question>;

export default {
  title: "EmbeddingSDK/Question/SaveQuestionForm",
  component: Question,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const Default = {
  render(args: QuestionComponentProps) {
    const [isSaveModalOpen, { toggle, close }] = useDisclosure(false);

    const [isBeforeSaveCalled, setBeforeSaveCalled] = useState(false);
    const [newQuestionTitle, setNewQuestionTitle] = useState("");

    return (
      <Question
        onBeforeSave={async () => setBeforeSaveCalled(true)}
        onSave={(question, context) => {
          if (context.isNewQuestion) {
            setNewQuestionTitle(question?.name ?? "");
          }

          close();
        }}
        {...args}
      >
        <Box p="lg">
          <Button onClick={toggle}>Save</Button>
        </Box>

        {isSaveModalOpen && (
          <Modal opened={isSaveModalOpen} onClose={close}>
            <Question.SaveQuestionForm onCancel={close} />
          </Modal>
        )}

        {!isSaveModalOpen && <Question.QuestionVisualization />}

        <Stack p="lg">
          {isBeforeSaveCalled && <Box>onBeforeSave is called</Box>}
          {newQuestionTitle && <Box>question saved as {newQuestionTitle}</Box>}
        </Stack>
      </Question>
    );
  },

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
  },
};
