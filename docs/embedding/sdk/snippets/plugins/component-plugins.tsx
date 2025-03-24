import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

const Example = () => (
  // [<snippet example>]
  <InteractiveQuestion
    questionId={1}
    plugins={{
      mapQuestionClickActions: () => [],
    }}
  />
  // [<endsnippet example>]
);
