import { t } from "ttag";

import { Badge } from "metabase/common/components/Badge";
import { Link } from "metabase/common/components/Link/Link";
import CS from "metabase/css/core/index.css";
import type { IconName } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type Question from "metabase-lib/v1/Question";

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
