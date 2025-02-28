import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import { Stack, Title } from "metabase/ui";

import { useInteractiveQuestionContext } from "../context";

export type SdkSaveQuestionFormProps = {
  onCancel?: () => void;
};

export const SdkSaveQuestionForm = ({ onCancel }: SdkSaveQuestionFormProps) => {
  const { question, originalQuestion, onSave, onCreate, saveToCollection } =
    useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  return (
    <SaveQuestionProvider
      question={question}
      originalQuestion={originalQuestion ?? null}
      onCreate={onCreate}
      onSave={onSave}
      multiStep={false}
      saveToCollection={saveToCollection}
    >
      <Stack p="md">
        <Title>
          <SaveQuestionTitle />
        </Title>
        <SaveQuestionForm onCancel={() => onCancel?.()} />
      </Stack>
    </SaveQuestionProvider>
  );
};
