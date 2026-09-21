import { StaticQuestion } from "@metabase/embedding-sdk-react";

const questionId = 1;

const Example = () => (
  // [<snippet example>]
  <StaticQuestion
    questionId={questionId}
    initialSqlParameters={{ product_id: 50 }}
  />
  // [<endsnippet example>]
);
