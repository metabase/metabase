import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { ViewButton } from "metabase/common/components/ViewButton";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";

interface ExploreResultsLinkProps {
  question: Question;
}

export function ExploreResultsLink({ question }: ExploreResultsLinkProps) {
  const query = question.isSaved()
    ? question.composeQuestionAdhoc()
    : undefined;
  const button = (
    <ViewButton disabled={!query} medium icon="insight" labelBreakpoint="sm">
      {t`Explore results`}
    </ViewButton>
  );

  if (query) {
    const url = Urls.question(query.setDisplay("table").setSettings({}));
    return <Link to={url}>{button}</Link>;
  }

  return button;
}
