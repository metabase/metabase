import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { ResetButton } from "embedding-sdk/components/private/ResetButton";
import * as Lib from "metabase-lib";

export const QuestionResetButton = ({
  onClick,
}: {
  onClick?: () => void;
} = {}) => {
  const { question, onReset } = useInteractiveQuestionContext();

  const handleReset = () => {
    onReset?.();
    onClick?.();
  };

  if (
    !question ||
    !Lib.canSave(question.query(), question.type()) ||
    !onReset
  ) {
    return null;
  }

  return <ResetButton onClick={handleReset} />;
};
