import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";
import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";

export const Title = () => {
  const { customTitle, question, withTitle } = useInteractiveQuestionContext();

  return (
    question &&
    withTitle &&
    (customTitle || <QuestionTitle question={question} />)
  );
};
