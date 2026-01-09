import type { MouseEvent } from "react";

import { ResetButton } from "embedding-sdk-bundle/components/private/ResetButton";
import type { ButtonProps } from "embedding-sdk-bundle/types/ui";
import { isSavedQuestionChanged } from "metabase/query_builder/utils/question";
import * as Lib from "metabase-lib";

import { useSdkQuestionContext } from "../../context";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type ResetButtonProps = ButtonProps;

/**
 * Button to reset question modifications. Only appears when there are unsaved changes to the question.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const QuestionResetButton = ({
  onClick,
  ...buttonProps
}: ResetButtonProps = {}) => {
  const { question, originalQuestion, onReset } = useSdkQuestionContext();

  const handleReset = (e: MouseEvent<HTMLButtonElement>) => {
    onReset();
    onClick?.(e);
  };

  const isQuestionChanged = originalQuestion
    ? isSavedQuestionChanged(question, originalQuestion)
    : true;

  const canSave = question && Lib.canSave(question.query(), question.type());

  if (!canSave || !isQuestionChanged) {
    return null;
  }

  return <ResetButton onClick={handleReset} {...buttonProps} />;
};
