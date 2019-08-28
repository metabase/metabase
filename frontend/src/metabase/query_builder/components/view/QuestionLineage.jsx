import React from "react";

import { t } from "ttag";

import Link from "metabase/components/Link";
import Badge from "metabase/components/Badge";

export default function QuestionLineage({
  question,
  originalQuestion,
  ...props
}) {
  if (!QuestionLineage.shouldRender({ question, originalQuestion })) {
    return null;
  }
  return (
    <Badge {...props}>
      {t`Started from`}{" "}
      <Link className="link" to={originalQuestion.getUrl()}>
        {originalQuestion.displayName()}
      </Link>
    </Badge>
  );
}

QuestionLineage.shouldRender = ({ question, originalQuestion }) =>
  !question.isSaved() && !!originalQuestion;
