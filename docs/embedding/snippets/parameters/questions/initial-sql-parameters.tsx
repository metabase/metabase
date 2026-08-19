import { StaticQuestion } from "@metabase/embedding-sdk-react";

const questionId = "Pq7RsTuVwXyZaBcDeFgHi";

const Example = () => (
  // [<snippet example>]
  <StaticQuestion
    questionId={questionId}
    initialSqlParameters={{ product_id: 50 }}
  />
  // [<endsnippet example>]
);
