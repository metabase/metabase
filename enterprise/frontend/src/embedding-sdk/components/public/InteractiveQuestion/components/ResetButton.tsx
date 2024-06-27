import { ResetButton } from "embedding-sdk/components/private/ResetButton";
import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";

export const QuestionResetButton = () => {
  const { onReset, withResetButton } = useInteractiveQuestionContext();

  return withResetButton && onReset && <ResetButton onClick={onReset} />;
};
