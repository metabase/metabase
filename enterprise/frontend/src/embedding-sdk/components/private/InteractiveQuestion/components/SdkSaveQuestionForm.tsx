import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import { useCreateQuestion } from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { Stack, Title } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionContext } from "../context";

export type SdkSaveQuestionFormProps = {
  onSave?: (question?: Question) => Promise<void>;
  onClose?: () => void;
};

export const SdkSaveQuestionForm = ({
  onClose,
  onSave,
}: SdkSaveQuestionFormProps) => {
  const { question, originalQuestion } = useInteractiveQuestionContext();

  const handleCreate = useCreateQuestion();
  const handleSaveQuestion = useSaveQuestion();

  const handleSave = async (question: Question) => {
    await onSave?.(question);
    await handleSaveQuestion(question);
  };

  if (!question) {
    return null;
  }

  return (
    <SaveQuestionProvider
      question={question}
      originalQuestion={originalQuestion ?? null}
      onCreate={handleCreate}
      onSave={handleSave}
      multiStep={false}
      initialCollectionId={null}
    >
      <Stack p="md">
        <Title>
          <SaveQuestionTitle />
        </Title>
        <SaveQuestionForm onCancel={() => onClose?.()} />
      </Stack>
    </SaveQuestionProvider>
  );
};
