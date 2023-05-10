import React from "react";
import { t } from "ttag";
import Link from "metabase/core/components/Link/Link";
import Badge from "metabase/components/Badge";
import Question from "metabase-lib/Question";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionLineage;
