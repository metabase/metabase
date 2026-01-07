import type { MouseEventHandler } from "react";
import { t } from "ttag";

import { useCollectionData } from "embedding-sdk-bundle/hooks/private/use-collection-data";
import type { ButtonProps } from "embedding-sdk-bundle/types/ui";
import { isQuestionDirty } from "metabase/query_builder/utils/question";
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
  canWriteToTargetCollection,
}: {
  question?: Question;
  originalQuestion?: Question;
  canWriteToTargetCollection: boolean;
}) => {
  const canSave = question && Lib.canSave(question.query(), question.type());
  const isQuestionChanged = originalQuestion
    ? isQuestionDirty(question, originalQuestion)
    : true;

  return Boolean(isQuestionChanged && canSave) && canWriteToTargetCollection;
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
  const { question, originalQuestion, isSaveEnabled, targetCollection } =
    useSdkQuestionContext();

  const { canWrite: canWriteToTargetCollection } = useCollectionData(
    targetCollection,
    { skipCollectionFetching: !isSaveEnabled },
  );

  const isSaveButtonEnabled = shouldShowSaveButton({
    question,
    originalQuestion,
    canWriteToTargetCollection,
  });

  return (
    <ToolbarButton
      label={t`Save`}
      disabled={!isSaveButtonEnabled}
      {...buttonProps}
    />
  );
};
