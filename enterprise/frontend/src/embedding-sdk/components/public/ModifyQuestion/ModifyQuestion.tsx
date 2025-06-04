import { QuestionEditor } from "embedding-sdk/components/private/QuestionEditor";
import type { SdkFunctionalComponent } from "embedding-sdk/types/react";

import type { BaseInteractiveQuestionProps } from "../InteractiveQuestion";

/**
 * @deprecated Use `InteractiveQuestion` with `isSaveEnabled={true}` instead.
 *
 * @function
 * @category ModifyQuestion
 * @param props
 **/
export const ModifyQuestion: SdkFunctionalComponent<
  BaseInteractiveQuestionProps
> = ({
  questionId,
  plugins,
  onSave,
  onBeforeSave,
  entityTypes,
  isSaveEnabled,
  targetCollection,
}: BaseInteractiveQuestionProps) => (
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
