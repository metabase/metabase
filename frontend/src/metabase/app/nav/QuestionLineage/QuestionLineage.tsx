import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import CS from "metabase/css/core/index.css";
import { Ellipsified } from "metabase/ui";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";

export interface QuestionLineageProps {
  question?: Question;
  originalQuestion?: Question;
}

export const QuestionLineage = ({
  question,
  originalQuestion,
}: QuestionLineageProps): JSX.Element | null => {
  if (!question || !originalQuestion) {
    return null;
  }

  return (
    <Ellipsified
      c="text-secondary"
      fw="bold"
      lh="normal"
      miw={0}
      fz="0.875em"
      showTooltip={false}
    >
      {t`Started from`}{" "}
      <Link className={CS.link} to={Urls.question(originalQuestion)}>
        {originalQuestion.displayName()}
      </Link>
    </Ellipsified>
  );
};
