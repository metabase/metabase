/* eslint-disable react/prop-types */
import React from "react";

import Question from "metabase/entities/questions";

// TODO: remove this in favor of using Question.Name directly

const QuestionName = ({ questionId }) => <Question.Name id={questionId} />;

export default QuestionName;
