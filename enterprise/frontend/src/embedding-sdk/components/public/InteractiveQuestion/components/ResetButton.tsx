import { ResetButton } from "embedding-sdk/components/private/ResetButton";
import {
  useInteractiveQuestionContext,
  useInteractiveQuestionData,
} from "embedding-sdk/components/public/InteractiveQuestion/context";

export const QuestionResetButton = () => {
  const { onReset, withResetButton } = useInteractiveQuestionContext();
  const { hasQuestionChanges } = useInteractiveQuestionData();

  return (
    withResetButton &&
    hasQuestionChanges &&
    onReset && <ResetButton onClick={onReset} />
  );
};
