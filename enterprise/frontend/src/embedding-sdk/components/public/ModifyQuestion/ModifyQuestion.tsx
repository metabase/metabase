import { QuestionEditor } from "embedding-sdk/components/private/QuestionEditor";

import type { InteractiveQuestionProps } from "../InteractiveQuestion";

type ModifyQuestionProps = InteractiveQuestionProps;

export const ModifyQuestion = ({
  questionId,
  plugins,
  onSave,
  onBeforeSave,
  entityTypeFilter,
  saveOptions,
}: ModifyQuestionProps = {}) => (
  <QuestionEditor
    questionId={questionId}
    plugins={plugins}
    onSave={onSave}
    onBeforeSave={onBeforeSave}
    entityTypeFilter={entityTypeFilter}
    saveOptions={saveOptions}
  />
);
