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
  ...initialValueProps
}: SaveQuestionProps & SaveQuestionFormProps) => (
  <SaveQuestionProvider
    question={question}
    originalQuestion={originalQuestion}
    onCreate={onCreate}
    onSave={onSave}
    multiStep={multiStep}
    {...initialValueProps}
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
