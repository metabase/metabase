import { ResetButton } from "embedding-sdk/components/private/ResetButton";

import { useInteractiveQuestionContext } from "../context";

export const QuestionResetButton = () => {
  const { card, onReset } = useInteractiveQuestionContext();

  const hasQuestionChanged =
    card && (!card.id || card.id !== card.original_card_id);

  return hasQuestionChanged && onReset && <ResetButton onClick={onReset} />;
};
