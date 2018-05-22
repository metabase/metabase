import React from "react";

import EntityListLoader from "metabase/entities/containers/EntityListLoader";

const QuestionListLoader = props => (
  <EntityListLoader entityType="questions" {...props} />
);

export default QuestionListLoader;
