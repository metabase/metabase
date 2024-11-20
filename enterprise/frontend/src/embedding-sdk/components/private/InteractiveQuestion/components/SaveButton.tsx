import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";

import { useInteractiveQuestionContext } from "../context";

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

  if (!isQuestionChanged || !canSave) {
    return null;
  }

  return <Button onClick={onClick}>Save</Button>;
};
