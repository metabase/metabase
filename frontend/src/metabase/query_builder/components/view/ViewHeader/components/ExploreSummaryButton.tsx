import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  getSummaryQuestion,
  getSummaryUrl,
} from "metabase/common/metrics-viewer/question-summary";
import { Button, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";

export function ExploreSummaryButton({ question }: { question: Question }) {
  const returnTo = Urls.serializedQuestion(question.cardWithNormalizedQuery(), {
    parameterValues: question._parameterValues,
    includeDisplayIsLocked: true,
  });
  return (
    <Button
      component={Link}
      to={getSummaryUrl(getSummaryQuestion(question), returnTo)}
      leftSection={<Icon name="sum" aria-hidden />}
    >
      {t`Explore summary`}
    </Button>
  );
}
