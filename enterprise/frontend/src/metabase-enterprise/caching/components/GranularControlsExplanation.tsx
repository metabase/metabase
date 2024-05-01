import { t } from "ttag";

import { Title } from "metabase/ui";

export const GranularControlsExplanation = () => (
  <>
    &nbsp;
    {t`You can set up one rule for all your databases, or apply more specific settings to each database.`}
    <Title
      order={4}
    >{t`Pick the policy for when cached query results should be invalidated.`}</Title>
  </>
);
