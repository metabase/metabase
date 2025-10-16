import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/common/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/common/components/SaveQuestionForm/context";
import type { SaveQuestionProps } from "metabase/common/components/SaveQuestionForm/types";
import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
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
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
  } = PLUGIN_DEPENDENCIES.useCheckCardDependencies({
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
        padding="xl"
        {...modalProps}
        size={isConfirmationShown ? "xl" : undefined}
        closeOnEscape={false}
        onClose={onClose}
      >
        <Modal.Overlay />
        <Modal.Content data-testid="save-question-modal">
          <Modal.Header px={isConfirmationShown ? "xl" : undefined}>
            <Modal.Title>
              {isConfirmationShown ? (
                <PLUGIN_DEPENDENCIES.CheckDependenciesTitle />
              ) : (
                <SaveQuestionTitle />
              )}
            </Modal.Title>
            <Flex justify="flex-end">
              <Modal.CloseButton />
            </Flex>
          </Modal.Header>
          <Modal.Body px={isConfirmationShown ? 0 : undefined}>
            {checkData != null && isConfirmationShown ? (
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
