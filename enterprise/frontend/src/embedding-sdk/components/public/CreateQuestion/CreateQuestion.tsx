import { QuestionEditor } from "embedding-sdk/components/private/QuestionEditor";

import type { InteractiveQuestionProps } from "../InteractiveQuestion";

type CreateQuestionProps = Omit<InteractiveQuestionProps, "questionId">;

/** @deprecated Use `InteractiveQuestion` with `isSaveEnabled={true}` and without specifying `questionId` instead. */
export const CreateQuestion = ({
  plugins,
  onSave,
  onBeforeSave,
  entityTypeFilter,
  isSaveEnabled,
  saveToCollectionId,
}: CreateQuestionProps = {}) => (
  <QuestionEditor
    plugins={plugins}
    onBeforeSave={onBeforeSave}
    onSave={onSave}
    entityTypeFilter={entityTypeFilter}
    isSaveEnabled={isSaveEnabled}
    saveToCollectionId={saveToCollectionId}
  />
);
