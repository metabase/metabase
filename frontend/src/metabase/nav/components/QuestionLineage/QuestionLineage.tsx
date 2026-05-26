import { t } from "ttag";

import { Badge } from "metabase/common/components/Badge";
import { Link } from "metabase/common/components/Link/Link";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";
import type { IconName } from "metabase-types/api";

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
      <Link className={CS.link} to={Urls.question(originalQuestion)}>
        {originalQuestion.displayName()}
      </Link>
    </Badge>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionLineage;
