import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

const Example = () => (
  // [<snippet example>]
  <InteractiveQuestion
    questionId="Pq7RsTuVwXyZaBcDeFgHi"
    plugins={{
      mapQuestionClickActions: () => [],
    }}
  />
  // [<endsnippet example>]
);
