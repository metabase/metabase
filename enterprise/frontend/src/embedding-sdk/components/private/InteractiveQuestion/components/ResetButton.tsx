import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { ResetButton } from "embedding-sdk/components/private/ResetButton";
import { isSavedQuestionChanged } from "metabase/query_builder/utils/question";
import * as Lib from "metabase-lib";

export const QuestionResetButton = ({
  onClick,
}: {
  onClick?: () => void;
} = {}) => {
  const { question, originalQuestion, onReset } =
    useInteractiveQuestionContext();

  const handleReset = () => {
    onReset?.();
    onClick?.();
  };

  const isQuestionChanged = originalQuestion
    ? isSavedQuestionChanged(question, originalQuestion)
    : true;

  const canSave = question && Lib.canSave(question.query(), question.type());

  if (!canSave || !isQuestionChanged || !onReset) {
    return null;
  }

  return <ResetButton onClick={handleReset} />;
};
