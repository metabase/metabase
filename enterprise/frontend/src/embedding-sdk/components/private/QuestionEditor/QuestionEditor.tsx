import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import type { InteractiveQuestionProps } from "embedding-sdk/components/public/InteractiveQuestion";
import { InteractiveQuestion } from "embedding-sdk/components/public/InteractiveQuestion";
import {
  LLMSuggestionQuestionInfo,
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import type { SaveQuestionProps } from "metabase/components/SaveQuestionForm/types";
import { useCreateQuestion } from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { Box, Flex, Group, Modal, type ModalProps, Tabs } from "metabase/ui";

import { useInteractiveQuestionContext } from "../InteractiveQuestion/context";

export const SaveQuestionModalInner = ({
  question,
  originalQuestion,
  onSave,
  onCreate,
  ...modalProps
}: SaveQuestionProps & Omit<ModalProps, "title">) => (
  <SaveQuestionProvider
    question={question}
    originalQuestion={originalQuestion ?? null}
    onSave={onSave}
    onCreate={onCreate}
  >
    <Modal.Root padding="2.5rem" {...modalProps}>
      <Modal.Overlay />
      <Modal.Content data-testid="save-question-modal">
        <Modal.Header>
          <Modal.Title>
            <SaveQuestionTitle />
          </Modal.Title>
          <Flex align="center" justify="flex-end" gap="sm">
            <LLMSuggestionQuestionInfo />
            <Modal.CloseButton />
          </Flex>
        </Modal.Header>
        <Modal.Body>
          <SaveQuestionForm
            onSave={modalProps.onClose}
            onCancel={modalProps.onClose}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  </SaveQuestionProvider>
);

export const SaveQuestionModal = (modalProps: Omit<ModalProps, "title">) => {
  const { originalQuestion, question } = useInteractiveQuestionContext();
  const handleCreate = useCreateQuestion();
  const handleSave = useSaveQuestion();

  return (
    question && (
      <SaveQuestionModalInner
        onCreate={handleCreate}
        onSave={handleSave}
        originalQuestion={originalQuestion ?? null}
        question={question}
        {...modalProps}
      />
    )
  );
};

const QuestionEditorInner = () => {
  const { queryResults, runQuestion } = useInteractiveQuestionContext();

  const [activeTab, setActiveTab] = useState<
    "notebook" | "visualization" | (string & unknown) | null
  >("notebook");
  const [isSaveModalOpen, { open: openSaveModal, close: closeSaveModal }] =
    useDisclosure(false);

  const onOpenVisualizationTab = async () => {
    setActiveTab("visualization");
    await runQuestion();
  };

  return (
    <Box w="100%" h="100%">
      <Tabs
        value={activeTab}
        onTabChange={setActiveTab}
        defaultValue="notebook"
      >
        <Group position="apart">
          <Group>
            <Tabs.Tab value="notebook">Notebook</Tabs.Tab>
            {queryResults ? (
              <Tabs.Tab value="visualization" onClick={onOpenVisualizationTab}>
                Visualization
              </Tabs.Tab>
            ) : null}
          </Group>
          <Group>
            <InteractiveQuestion.ResetButton
              onClick={() => {
                setActiveTab("notebook");
                closeSaveModal();
              }}
            />
            <InteractiveQuestion.SaveButton onClick={openSaveModal} />
          </Group>
        </Group>

        <Tabs.Panel value="notebook">
          <InteractiveQuestion.Notebook
            onApply={() => setActiveTab("visualization")}
          />
        </Tabs.Panel>

        <Tabs.Panel value="visualization">
          <InteractiveQuestion.QuestionVisualization />
        </Tabs.Panel>
      </Tabs>

      {/* Refer to the SaveQuestionProvider for context on why we have to do it like this */}
      {isSaveModalOpen && (
        <SaveQuestionModal opened={true} onClose={closeSaveModal} />
      )}
    </Box>
  );
};

export const QuestionEditor = ({
  questionId,
  plugins,
}: InteractiveQuestionProps) => (
  <InteractiveQuestion questionId={questionId} plugins={plugins}>
    <QuestionEditorInner />
  </InteractiveQuestion>
);
