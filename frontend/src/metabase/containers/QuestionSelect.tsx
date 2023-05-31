import Question from "metabase/entities/questions";

import type { CardId } from "metabase-types/api";

import ItemSelect from "./ItemSelect";
import QuestionPicker from "./QuestionPicker";

const QuestionName = ({ questionId }: { questionId: CardId }) => (
  <Question.Name id={questionId} />
);

const QuestionSelect = ItemSelect(QuestionPicker, QuestionName, "question");

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionSelect;
