import React from "react";

import Icon from "metabase/components/Icon";

import Visualizations from "metabase/visualizations";

const QuestionIcon = ({ question, ...props }) => (
  <Icon
    {...props}
    name={(Visualizations.get(question.display) || {}).iconName || "unknown"}
  />
);

export default QuestionIcon;
