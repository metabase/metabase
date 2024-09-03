import {
  QuestionEditor,
  type QuestionEditorProps,
} from "embedding-sdk/components/private/QuestionEditor";

import type { InteractiveQuestionProps } from "../InteractiveQuestion";

type ModifyQuestionProps = InteractiveQuestionProps & QuestionEditorProps;

export const ModifyQuestion = ({
  questionId,
  plugins,
  isSaveEnabled,
}: ModifyQuestionProps = {}) => (
  <QuestionEditor
    questionId={questionId}
    plugins={plugins}
    isSaveEnabled={isSaveEnabled}
  />
);
