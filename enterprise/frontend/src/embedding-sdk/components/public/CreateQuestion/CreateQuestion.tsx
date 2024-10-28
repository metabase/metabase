import { QuestionEditor } from "embedding-sdk/components/private/QuestionEditor";

import type { InteractiveQuestionProps } from "../InteractiveQuestion";

type CreateQuestionProps = Omit<InteractiveQuestionProps, "questionId">;

export const CreateQuestion = ({
  plugins,
  onSave,
  onBeforeSave,
  entityTypeFilter,
  saveOptions,
}: CreateQuestionProps = {}) => (
  <QuestionEditor
    plugins={plugins}
    onBeforeSave={onBeforeSave}
    onSave={onSave}
    entityTypeFilter={entityTypeFilter}
    saveOptions={saveOptions}
  />
);
