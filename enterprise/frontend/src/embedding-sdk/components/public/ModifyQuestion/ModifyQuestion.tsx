import { QuestionEditor } from "embedding-sdk";
import type { InteractiveQuestionProps } from "embedding-sdk/components/public/InteractiveQuestion";

type ModifyQuestionProps = InteractiveQuestionProps;

export const ModifyQuestion = ({
  questionId,
  plugins,
}: ModifyQuestionProps = {}) => (
  <QuestionEditor questionId={questionId} plugins={plugins} />
);
