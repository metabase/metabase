import { t } from "ttag";

import Badge from "metabase/components/Badge";
import Link from "metabase/core/components/Link/Link";
import CS from "metabase/css/core/index.css";
import type { IconName } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";

export interface QuestionLineageProps {
  icon?: IconName;
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
      <Link className={CS.link} to={ML_Urls.getUrl(originalQuestion)}>
        {originalQuestion.displayName()}
      </Link>
    </Badge>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionLineage;
