import type { MouseEvent } from "react";

import { ResetButton } from "embedding-sdk/components/private/ResetButton";
import type { ButtonProps } from "embedding-sdk/types/ui";
import { isSavedQuestionChanged } from "metabase/query_builder/utils/question";
import * as Lib from "metabase-lib";

import { useInteractiveQuestionContext } from "../../context";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type InteractiveQuestionResetButtonProps = ButtonProps;

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
}: InteractiveQuestionResetButtonProps = {}) => {
  const { question, originalQuestion, onReset } =
    useInteractiveQuestionContext();

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
