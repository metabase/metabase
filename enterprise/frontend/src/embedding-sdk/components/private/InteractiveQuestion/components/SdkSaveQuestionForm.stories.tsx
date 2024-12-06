import { useDisclosure } from "@mantine/hooks";
import { type ComponentProps, useState } from "react";

import { InteractiveQuestion } from "embedding-sdk";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button, Modal, Stack } from "metabase/ui";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

type InteractiveQuestionComponentProps = ComponentProps<
  typeof InteractiveQuestion
>;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/SaveQuestionForm",
  component: InteractiveQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const Default = {
  render(args: InteractiveQuestionComponentProps) {
    const [isSaveModalOpen, { toggle, close }] = useDisclosure(false);

    const [isBeforeSaveCalled, setBeforeSaveCalled] = useState(false);
    const [newQuestionTitle, setNewQuestionTitle] = useState("");

    return (
      <InteractiveQuestion
        onBeforeSave={async () => setBeforeSaveCalled(true)}
        onSave={(question, context) => {
          if (context.isNewQuestion) {
            setNewQuestionTitle(question?.displayName() ?? "");
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
            <InteractiveQuestion.SaveQuestionForm onCancel={close} />
          </Modal>
        )}

        {!isSaveModalOpen && <InteractiveQuestion.QuestionVisualization />}

        <Stack p="lg">
          {isBeforeSaveCalled && <Box>onBeforeSave is called</Box>}
          {newQuestionTitle && <Box>question saved as {newQuestionTitle}</Box>}
        </Stack>
      </InteractiveQuestion>
    );
  },

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
  },
};
