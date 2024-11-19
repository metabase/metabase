import * as Lib from "metabase-lib";

import { useInteractiveQuestionContext } from "../context";

import { ToolbarButton } from "./util/ToolbarButton";

export const SaveButton = ({
  onClick,
}: {
  onClick?: () => void;
} = {}) => {
  const { question, originalQuestion } = useInteractiveQuestionContext();

  const canSave = question && Lib.canSave(question.query(), question.type());
  const isQuestionChanged = originalQuestion
    ? question && question.isQueryDirtyComparedTo(originalQuestion)
    : true;

  return (
    <ToolbarButton
      label="Save"
      disabled={!isQuestionChanged || !canSave}
      onClick={onClick}
    />
  );
};
