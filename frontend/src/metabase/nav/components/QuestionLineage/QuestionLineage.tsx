import React from "react";
import { t } from "ttag";
import Link from "metabase/core/components/Link/Link";
import Badge from "metabase/components/Badge";
import Question from "metabase-lib/lib/Question";

export interface QuestionLineageProps {
  icon?: string;
  question?: Question;
  originalQuestion?: Question;
}

const QuestionLineage = ({
  icon,
  question,
  originalQuestion,
}: QuestionLineageProps): JSX.Element | null => {
  if (!question || !originalQuestion) {
    return null;
  }

  return (
    <Badge icon={icon} isSingleLine>
      {t`Started from`}{" "}
      <Link className="link" to={originalQuestion.getUrl()}>
        {originalQuestion.displayName()}
      </Link>
    </Badge>
  );
};

export default QuestionLineage;
