import { QuestionEditor } from "embedding-sdk/components/private/QuestionEditor";

import type { BaseQuestionProps } from "../Question";

/**
 * @deprecated Use `Question` with `isSaveEnabled={true}` instead.
 *
 * @function
 * @category ModifyQuestion
 * @param props
 **/
export const ModifyQuestion = ({
  questionId,
  plugins,
  onSave,
  onBeforeSave,
  entityTypes,
  isSaveEnabled,
  targetCollection,
}: BaseQuestionProps) => (
  <QuestionEditor
    questionId={questionId}
    plugins={plugins}
    onSave={onSave}
    onBeforeSave={onBeforeSave}
    entityTypes={entityTypes}
    isSaveEnabled={isSaveEnabled}
    targetCollection={targetCollection}
  />
);
