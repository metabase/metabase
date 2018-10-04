import React from "react";

import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";

const QuestionNameLoader = entityObjectLoader({
  entityType: "question",
  properties: ["name"],
  loadingAndErrorWrapper: false,
})(({ object }) => <span>{object && object.name}</span>);

const QuestionName = ({ questionId }) => {
  if (questionId == undefined || isNaN(questionId)) {
    return null;
  } else {
    return <QuestionNameLoader entityId={questionId} />;
  }
};

export default QuestionName;
