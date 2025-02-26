import type { MouseEvent } from "react";

import { ResetButton } from "embedding-sdk/components/private/ResetButton";
import { isSavedQuestionChanged } from "metabase/query_builder/utils/question";
import type { ButtonProps } from "metabase/ui";
import * as Lib from "metabase-lib";

import { useInteractiveQuestionContext } from "../../context";

export const QuestionResetButton = ({
  onClick,
  ...buttonProps
}: ButtonProps = {}) => {
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
