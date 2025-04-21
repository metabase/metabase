import type { MouseEventHandler } from "react";

import type { ButtonProps } from "embedding-sdk/types/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionContext } from "../context";

import { ToolbarButton } from "./util/ToolbarButton";

/**
 * @category InteractiveQuestion
 * @expand
 */
export type InteractiveQuestionSaveButtonProps = {
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
export const SaveButton = ({
  ...buttonProps
}: InteractiveQuestionSaveButtonProps = {}) => {
  const { question, originalQuestion } = useInteractiveQuestionContext();

  const isSaveButtonEnabled = shouldShowSaveButton({
    question,
    originalQuestion,
  });

  return (
    <ToolbarButton
      label="Save"
      disabled={!isSaveButtonEnabled}
      {...buttonProps}
    />
  );
};
