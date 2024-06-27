import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";
import {
  useInteractiveQuestionContext,
  useInteractiveQuestionData,
} from "embedding-sdk/components/public/InteractiveQuestion/context";

export const Title = () => {
  const { question } = useInteractiveQuestionData();
  const { customTitle, withTitle } = useInteractiveQuestionContext();

  return (
    withTitle &&
    (customTitle || (question && <QuestionTitle question={question} />))
  );
};
