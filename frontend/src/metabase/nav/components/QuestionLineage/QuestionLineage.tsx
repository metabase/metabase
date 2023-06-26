import { t } from "ttag";
import Link from "metabase/core/components/Link/Link";
import Badge from "metabase/components/Badge";
import { IconName } from "metabase/core/components/Icon";
import Question from "metabase-lib/Question";
import * as ML_Urls from "metabase-lib/urls";

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
      <Link className="link" to={ML_Urls.getUrl(originalQuestion)}>
        {originalQuestion.displayName()}
      </Link>
    </Badge>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionLineage;
