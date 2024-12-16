import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionContext } from "../context";

import { ToolbarButton } from "./util/ToolbarButton";

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

export const SaveButton = ({
  onClick,
}: {
  onClick?: () => void;
} = {}) => {
  const { question, originalQuestion } = useInteractiveQuestionContext();

  const isSaveButtonEnabled = shouldShowSaveButton({
    question,
    originalQuestion,
  });

  return (
    <ToolbarButton
      label="Save"
      disabled={!isSaveButtonEnabled}
      onClick={onClick}
    />
  );
};
