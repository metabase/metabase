import { t } from "ttag";

import Link from "metabase/core/components/Link";
import ViewButton from "metabase/query_builder/components/view/ViewButton";
import type Question from "metabase-lib/v1/Question";
import { getUrl as ML_getUrl } from "metabase-lib/v1/urls";

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
    const url = ML_getUrl(query.setDisplay("table").setSettings({}));
    return <Link to={url}>{button}</Link>;
  }

  return button;
}
