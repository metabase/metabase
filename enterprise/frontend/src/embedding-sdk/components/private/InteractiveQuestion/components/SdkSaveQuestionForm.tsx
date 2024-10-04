import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import { Stack, Title } from "metabase/ui";

import { useInteractiveQuestionContext } from "../context";

export type SdkSaveQuestionFormProps = {
  onClose?: () => void;
};

export const SdkSaveQuestionForm = ({ onClose }: SdkSaveQuestionFormProps) => {
  const { question, originalQuestion, onSave, onCreate } =
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
