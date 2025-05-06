import { useTranslatedCollectionId } from "embedding-sdk/hooks/private/use-translated-collection-id";
import {
  SaveQuestionForm,
  SaveQuestionTitle,
} from "metabase/components/SaveQuestionForm";
import { SaveQuestionProvider } from "metabase/components/SaveQuestionForm/context";
import { Stack, Title } from "metabase/ui";

import { useInteractiveQuestionContext } from "../context";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type InteractiveQuestionSaveQuestionFormProps = {
  /**
   * Callback function executed when save is cancelled
   */
  onCancel?: () => void;
};

/**
 * Form for saving a question, including title and description. When saved:
 *
 * - For existing questions: Calls {@link InteractiveQuestionProps.onSave}
 * - Both callbacks receive the updated question object
 * - Form can be cancelled via the {@link InteractiveQuestionSaveQuestionFormProps.onCancel}
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const SdkSaveQuestionForm = ({
  onCancel,
}: InteractiveQuestionSaveQuestionFormProps) => {
  const { question, originalQuestion, onSave, onCreate, targetCollection } =
    useInteractiveQuestionContext();

  const { id, isLoading } = useTranslatedCollectionId({
    id: targetCollection,
  });

  if (!question || isLoading) {
    return null;
  }

  return (
    <SaveQuestionProvider
      question={question}
      originalQuestion={originalQuestion ?? null}
      onCreate={onCreate}
      onSave={onSave}
      multiStep={false}
      targetCollection={id}
    >
      <Stack p="md">
        <Title order={2}>
          <SaveQuestionTitle />
        </Title>
        <SaveQuestionForm onCancel={() => onCancel?.()} />
      </Stack>
    </SaveQuestionProvider>
  );
};
