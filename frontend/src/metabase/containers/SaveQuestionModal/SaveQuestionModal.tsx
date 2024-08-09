import { SaveQuestionForm } from "metabase/containers/SaveQuestionModal/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/containers/SaveQuestionModal/context";
import { Flex, Modal } from "metabase/ui";

import { LLMSuggestionQuestionInfo } from "./LLMSuggestionQuestionInfo";
import { SaveQuestionTitle } from "./SaveQuestionTitle";
import type { SaveQuestionModalProps, SaveQuestionProps } from "./types";

export const SaveQuestionModal = ({
  initialCollectionId,
  multiStep,
  onCancel,
  onCreate,
  onSave,
  originalQuestion,
  question,
}: SaveQuestionProps & SaveQuestionModalProps) => (
  <SaveQuestionProvider
    question={question}
    originalQuestion={originalQuestion}
    onCreate={onCreate}
    onSave={onSave}
    multiStep={multiStep}
    initialCollectionId={initialCollectionId}
  >
    <Modal.Root onClose={onCancel} opened={true}>
      <Modal.Overlay />

      <Modal.Content p="md" data-testid="save-question-modal">
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
          <SaveQuestionForm onCancel={onCancel} />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  </SaveQuestionProvider>
);
