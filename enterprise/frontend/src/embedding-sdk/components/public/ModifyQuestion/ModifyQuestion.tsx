import { QuestionEditor } from "embedding-sdk/components/private/QuestionEditor";

import type { InteractiveQuestionProps } from "../InteractiveQuestion";

type ModifyQuestionProps = InteractiveQuestionProps;

export const ModifyQuestion = ({
  questionId,
  plugins,
  enableSave,
}: ModifyQuestionProps = {}) => (
  <QuestionEditor
    questionId={questionId}
    plugins={plugins}
    enableSave={enableSave}
  />
);
