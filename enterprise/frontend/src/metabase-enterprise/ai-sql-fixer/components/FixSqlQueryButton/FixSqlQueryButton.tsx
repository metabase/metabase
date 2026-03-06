import { t } from "ttag";

import { useMetabotEnabledEmbeddingAware } from "metabase/metabot/hooks";
import { Button } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { trackQueryFixClicked } from "../../analytics";

export function FixSqlQueryButton() {
  const isMetabotEnabled = useMetabotEnabledEmbeddingAware();
  const { submitInput, isDoingScience } = useMetabotAgent("sql");

  if (!isMetabotEnabled) {
    return null;
  }

  const handleClick = () => {
    trackQueryFixClicked();
    // SQL and error message are included in the context.
    submitInput("Fix this SQL query");
  };

  return (
    <Button
      loading={isDoingScience}
      onClick={handleClick}
    >{t`Have Metabot fix it`}</Button>
  );
}
