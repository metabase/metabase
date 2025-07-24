import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import {
  SdkQuestion,
  type SdkQuestionProps,
} from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button, Modal, Stack } from "metabase/ui";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/SaveQuestionForm",
  component: SdkQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const Default = {
  render(args: SdkQuestionProps) {
    const [isSaveModalOpen, { toggle, close }] = useDisclosure(false);

    const [isBeforeSaveCalled, setBeforeSaveCalled] = useState(false);
    const [newQuestionTitle, setNewQuestionTitle] = useState("");

    return (
      <SdkQuestion
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
            <SdkQuestion.SaveQuestionForm onCancel={close} />
          </Modal>
        )}

        {!isSaveModalOpen && <SdkQuestion.QuestionVisualization />}

        <Stack p="lg">
          {isBeforeSaveCalled && <Box>onBeforeSave is called</Box>}
          {newQuestionTitle && <Box>question saved as {newQuestionTitle}</Box>}
        </Stack>
      </SdkQuestion>
    );
  },

  args: {
    questionId: QUESTION_ID,
    isSaveEnabled: true,
  },
};
