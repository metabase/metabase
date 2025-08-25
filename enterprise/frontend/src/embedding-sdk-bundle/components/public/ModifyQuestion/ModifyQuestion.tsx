import type { BaseSdkQuestionProps } from "embedding-sdk-bundle";
import { QuestionEditor } from "embedding-sdk-bundle/components/private/QuestionEditor";

/**
 * @deprecated Use `InteractiveQuestion` with `isSaveEnabled={true}` instead.
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
}: BaseSdkQuestionProps) => (
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
