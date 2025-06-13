import { Question } from "@metabase/embedding-sdk-react";

const Example = () => (
  // [<snippet example>]
  <Question
    questionId={1}
    plugins={{
      mapQuestionClickActions: () => [],
    }}
  />
  // [<endsnippet example>]
);
