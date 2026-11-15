import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/common/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/common/components/SaveQuestionForm/context";
import type { SaveQuestionProps } from "metabase/common/components/SaveQuestionForm/types";
import { Modal, type ModalProps } from "metabase/ui";

type SaveQuestionModalProps = Omit<SaveQuestionProps, "initialDashboardTabId"> &
  Omit<ModalProps, "title">;

export const SaveQuestionModal = ({
  multiStep,
  onCreate,
  onSave,
  onClose,
  originalQuestion,
  question,
  closeOnSuccess,
  initialCollectionId,
  targetCollection,
  ...modalProps
}: SaveQuestionModalProps) => {
  return (
    <SaveQuestionProvider
      question={question}
      originalQuestion={originalQuestion}
      onCreate={async (question, options) => {
        const newQuestion = await onCreate(question, options);

        if (closeOnSuccess) {
          onClose();
        }

        return newQuestion;
      }}
      onSave={onSave}
      onCancel={onClose}
      multiStep={multiStep}
      initialCollectionId={initialCollectionId}
      targetCollection={targetCollection}
    >
      <Modal
        density="relaxed"
        data-testid="save-question-modal"
        {...modalProps}
        title={<SaveQuestionTitle />}
        onClose={onClose}
      >
        <SaveQuestionForm
          onSaveSuccess={() => closeOnSuccess && onClose()}
          onCancel={onClose}
        />
      </Modal>
    </SaveQuestionProvider>
  );
};
