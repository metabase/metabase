import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { Stack, Title } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { useInteractiveQuestionContext } from "../context";

export type SdkSaveQuestionFormProps = {
  onCancel?: () => void;
};

export const SdkSaveQuestionForm = ({ onCancel }: SdkSaveQuestionFormProps) => {
  const { question, originalQuestion, onSave, onCreate, targetCollection } =
    useInteractiveQuestionContext();

  const { id, isLoading } = useValidatedEntityId({
    type: "collection",
    id: targetCollection,
  });

  if (!question || isLoading) {
    return null;
  }

  const finalId = id ?? targetCollection;

  return (
    <SaveQuestionProvider
      question={question}
      originalQuestion={originalQuestion ?? null}
      onCreate={onCreate}
      onSave={onSave}
      multiStep={false}
      targetCollection={isValidId(finalId) ? finalId : undefined}
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

const isValidId = (collectionId: unknown): collectionId is CollectionId => {
  return (
    !!collectionId &&
    (typeof collectionId === "number" ||
      collectionId === "personal" ||
      collectionId === "root")
  );
};
