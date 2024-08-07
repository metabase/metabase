import { InteractiveQuestionProvider } from "embedding-sdk/components/public/InteractiveQuestion/context";
import Question from "metabase-lib/v1/Question";
import {
  Notebook,
  QuestionVisualization,
} from "../InteractiveQuestion/components";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";

export const NewQuestion = () => {
  const metadata = useSelector(getMetadata);
  const newCard = Question.create({ metadata }).card();

  return (
    <InteractiveQuestionProvider deserializedCard={newCard} options={{}}>
      <Notebook />
      <QuestionVisualization />
    </InteractiveQuestionProvider>
  );
};
