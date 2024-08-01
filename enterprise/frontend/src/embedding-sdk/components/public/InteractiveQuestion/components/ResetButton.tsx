import { useMemo } from "react";

import { ResetButton } from "embedding-sdk/components/private/ResetButton";

import { useInteractiveQuestionContext } from "../context";

export const QuestionResetButton = () => {
  const { question, onReset } = useInteractiveQuestionContext();

  const hasQuestionChanged = useMemo(() => {
    const card = question?.card();

    return card && (!card.id || card.id !== card.original_card_id);
  }, [question]);

  if (!hasQuestionChanged || !onReset) {
    return null;
  }

  return <ResetButton onClick={onReset} />;
};
