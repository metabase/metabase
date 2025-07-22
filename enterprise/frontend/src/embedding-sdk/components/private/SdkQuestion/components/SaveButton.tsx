import type { MouseEventHandler } from "react";
import { t } from "ttag";

import type { ButtonProps } from "embedding-sdk/types/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useSdkQuestionContext } from "../context";

import { ToolbarButton } from "./util/ToolbarButton";

/**
 * @category InteractiveQuestion
 * @expand
 */
export type SaveButtonProps = {
  /**
   * A handler function to be called when the button is clicked
   */
  onClick?: MouseEventHandler<HTMLButtonElement>;
} & ButtonProps;

export const shouldShowSaveButton = ({
  question,
  originalQuestion,
}: {
  question?: Question;
  originalQuestion?: Question;
}) => {
  const canSave = question && Lib.canSave(question.query(), question.type());
  const isQuestionChanged = originalQuestion
    ? question && question.isQueryDirtyComparedTo(originalQuestion)
    : true;

  return Boolean(isQuestionChanged && canSave);
};

/**
 * Button for saving question changes. Only enabled when there are unsaved modifications to the question.
 *
 * _Note_: Currently, in custom layouts, the `SaveButton` must have an `onClick` handler or the button will not do anything when clicked.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const SaveButton = ({ ...buttonProps }: SaveButtonProps = {}) => {
  const { question, originalQuestion } = useSdkQuestionContext();

  const isSaveButtonEnabled = shouldShowSaveButton({
    question,
    originalQuestion,
  });

  return (
    <ToolbarButton
      label={t`Save`}
      disabled={!isSaveButtonEnabled}
      {...buttonProps}
    />
  );
};
