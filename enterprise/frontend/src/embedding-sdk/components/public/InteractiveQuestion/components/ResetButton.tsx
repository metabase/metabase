import { ResetButton } from "embedding-sdk/components/private/ResetButton";

import { useInteractiveQuestionContext } from "../context";
import { useInteractiveQuestionData } from "../hooks";

export const QuestionResetButton = () => {
  const { onReset } = useInteractiveQuestionContext();
  const { hasQuestionChanges } = useInteractiveQuestionData();

  return hasQuestionChanges && onReset && <ResetButton onClick={onReset} />;
};
