import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";

import { useInteractiveQuestionData } from "../hooks";

export const Title = () => {
  const { question } = useInteractiveQuestionData();

  return question && <QuestionTitle question={question} />;
};
