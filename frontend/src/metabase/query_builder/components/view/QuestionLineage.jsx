import React from "react";

import { t } from "ttag";

import Link from "metabase/components/Link";

const QuestionLineage = ({ question, originalQuestion, ...props }) =>
  QuestionLineage.shouldRender({ question, originalQuestion }) ? (
    <span {...props}>
      {t`Started from`}{" "}
      <Link className="link" to={originalQuestion.getUrl()}>
        {originalQuestion.displayName()}
      </Link>
    </span>
  ) : null;

QuestionLineage.shouldRender = ({ question, originalQuestion }) =>
  !question.isSaved() && !!originalQuestion;

export default QuestionLineage;
