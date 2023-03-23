/* eslint-disable react/prop-types */
import React from "react";

import { fullDuration } from "metabase/lib/formatting";

const QuestionRunningTime = ({
  question,
  result,
  className,
  ...props
}) => {
  const message = t`Running time: ${fullDuration(result.running_time)}`;

  return <span className={className}>{message}</span>;
};

QuestionRunningTime.shouldRender = ({ question, result, isObjectDetail }) =>
  result && result.running_time && !isObjectDetail && question.display() === "table";

export default QuestionRunningTime;
