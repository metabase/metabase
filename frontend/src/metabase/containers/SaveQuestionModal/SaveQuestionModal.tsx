import { skipToken, useGetDashboardQuery } from "metabase/api";
import {
  LLMSuggestionQuestionInfo,
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import type { SaveQuestionProps } from "metabase/components/SaveQuestionForm/types";
import { Flex, Modal, type ModalProps } from "metabase/ui";

export const SaveQuestionModal = ({
  multiStep,
  onCreate,
  onSave,
  originalQuestion,
  question,
  closeOnSuccess,
  initialCollectionId,
  initialDashboardId,
  ...modalProps
}: SaveQuestionProps & Omit<ModalProps, "title">) => {
  const saveToDashboardId = question.dashboardId();
  const { data: saveToDashboard } = useGetDashboardQuery(
    saveToDashboardId ? { id: saveToDashboardId } : skipToken,
  );

  const initialDashboardTabId =
    saveToDashboard?.tabs && saveToDashboard?.tabs.length > 1
      ? saveToDashboard?.tabs[0].id
      : null;

  // TODO: i think the initialDashboardId thing isn't needed, we can just rely on the question having a dashboard_id
  // TODO: maybe SaveQuestionProvider could do some lifting here as well..
  //       seems like we could feed it some context do what is needed (i.e. are we saving a dashbaord question right now? could be available in the context)

  return (
    <SaveQuestionProvider
      question={question}
      originalQuestion={originalQuestion}
      onCreate={onCreate}
      onSave={onSave}
      multiStep={multiStep}
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
              saveToDashboard={saveToDashboard}
            />
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </SaveQuestionProvider>
  );
};
