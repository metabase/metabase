import { QuestionEditor } from "embedding-sdk/components/private/QuestionEditor";

import type { InteractiveQuestionProps } from "../InteractiveQuestion";

type CreateQuestionProps = Omit<InteractiveQuestionProps, "questionId">;

export const CreateQuestion = ({
  plugins,
  isSaveEnabled,
  onSave,
  onBeforeSave,
  entityTypeFilter,
}: CreateQuestionProps = {}) => (
  <QuestionEditor
    plugins={plugins}
    isSaveEnabled={isSaveEnabled}
    onBeforeSave={onBeforeSave}
    onSave={onSave}
    entityTypeFilter={entityTypeFilter}
  />
);
