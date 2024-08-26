import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import { useCreateQuestion } from "metabase/query_builder/containers/use-create-question";
import { useSaveQuestion } from "metabase/query_builder/containers/use-save-question";
import { Stack, Title } from "metabase/ui";

import { useInteractiveQuestionContext } from "../context";

export const SaveQuestion = ({ onClose }: { onClose: () => void }) => {
  const { question, originalQuestion } = useInteractiveQuestionContext();

  const handleCreate = useCreateQuestion();
  const handleSave = useSaveQuestion();

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
        <SaveQuestionForm onCancel={onClose} />
      </Stack>
    </SaveQuestionProvider>
  );
};
