import { SaveQuestionForm } from "metabase/containers/SaveQuestionModal/SaveQuestionForm";
import {
  SaveQuestionProvider,
  useSaveQuestionContext,
} from "metabase/containers/SaveQuestionModal/context";
import type {
  SaveQuestionModalProps,
  SaveQuestionProps,
} from "metabase/containers/SaveQuestionModal/types";
import { PLUGIN_LLM_AUTODESCRIPTION } from "metabase/plugins";
import { Flex, Modal } from "metabase/ui";

const LLMSuggestionQuestionInfo = () => {
  const { initialValues, question, setValues, values } =
    useSaveQuestionContext();

  return (
    <PLUGIN_LLM_AUTODESCRIPTION.LLMSuggestQuestionInfo
      question={question}
      initialCollectionId={initialValues.collection_id}
      onAccept={nextValues => setValues({ ...values, ...nextValues })}
    />
  );
};

export const SaveQuestionTitle = () => {
  const { title } = useSaveQuestionContext();

  return title;
};

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
