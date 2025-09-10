import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/common/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/common/components/SaveQuestionForm/context";
import type { SaveQuestionProps } from "metabase/common/components/SaveQuestionForm/types";
import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getSubmittableQuestion } from "metabase/query_builder/selectors";
import { Flex, Modal, type ModalProps } from "metabase/ui";

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
  const {
    checkData,
    isConfirming,
    handleInitialSave,
    handleSaveAfterConfirmation,
  } = PLUGIN_DEPENDENCIES.useCheckCardDependencies({
    getSubmittableQuestion,
    onSave,
  });
  useEscapeToCloseModal(onClose);

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
      onSave={handleInitialSave}
      onCancel={onClose}
      multiStep={multiStep}
      initialCollectionId={initialCollectionId}
      targetCollection={targetCollection}
    >
      <Modal.Root
        padding="2.5rem"
        {...modalProps}
        size={isConfirming ? "xl" : undefined}
        closeOnEscape={false}
        onClose={onClose}
      >
        <Modal.Overlay />
        <Modal.Content data-testid="save-question-modal">
          <Modal.Header>
            <Modal.Title>
              {isConfirming ? (
                <PLUGIN_DEPENDENCIES.CheckDependenciesTitle />
              ) : (
                <SaveQuestionTitle />
              )}
            </Modal.Title>
            <Flex align="center" justify="flex-end" gap="sm">
              <Modal.CloseButton />
            </Flex>
          </Modal.Header>
          <Modal.Body>
            {checkData != null && isConfirming ? (
              <PLUGIN_DEPENDENCIES.CheckDependenciesForm
                checkData={checkData}
                onSave={handleSaveAfterConfirmation}
                onCancel={onClose}
              />
            ) : (
              <SaveQuestionForm
                onSaveSuccess={() => closeOnSuccess && onClose()}
                onCancel={onClose}
              />
            )}
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </SaveQuestionProvider>
  );
};
