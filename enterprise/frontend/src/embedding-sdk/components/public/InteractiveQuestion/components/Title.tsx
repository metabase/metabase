import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";
import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";

export const Title = () => {
  const { question } = useInteractiveQuestionContext();

  return question && <QuestionTitle question={question} />;
};
