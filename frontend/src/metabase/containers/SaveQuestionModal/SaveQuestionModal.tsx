import _ from "underscore";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import {
  LLMSuggestionQuestionInfo,
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import type { SaveQuestionProps } from "metabase/components/SaveQuestionForm/types";
import { Flex, Modal, type ModalProps } from "metabase/ui";

type SaveQuestionModalProps = Omit<SaveQuestionProps, "initialDashboardTabId"> &
  Omit<ModalProps, "title">;

export const SaveQuestionModal = ({
  multiStep,
  onCreate,
  onSave,
  originalQuestion,
  question,
  closeOnSuccess,
  initialCollectionId,
  saveToCollectionId,
  ...modalProps
}: SaveQuestionModalProps) => {
  const saveToDashboardId = question.dashboardId();
  const { data: saveToDashboard } = useGetDashboardQuery(
    saveToDashboardId ? { id: saveToDashboardId } : skipToken,
  );

  const initialDashboardTabId =
    _.first(saveToDashboard?.tabs || [])?.id ?? null;

  return (
    <SaveQuestionProvider
      question={question}
      originalQuestion={originalQuestion}
      onCreate={async question => {
        const newQuestion = await onCreate(question);

        if (closeOnSuccess) {
          modalProps.onClose();
        }

        return newQuestion;
      }}
      onSave={onSave}
      multiStep={multiStep}
      initialCollectionId={initialCollectionId}
      saveToCollectionId={saveToCollectionId}
      initialDashboardTabId={initialDashboardTabId}
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
              onSaveSuccess={() => closeOnSuccess && modalProps.onClose()}
              onCancel={modalProps.onClose}
            />
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </SaveQuestionProvider>
  );
};
