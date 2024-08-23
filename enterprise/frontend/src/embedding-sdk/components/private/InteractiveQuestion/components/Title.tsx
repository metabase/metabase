import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";

export const Title = () => {
  const { question } = useInteractiveQuestionContext();

  return question && <QuestionTitle question={question} />;
};
