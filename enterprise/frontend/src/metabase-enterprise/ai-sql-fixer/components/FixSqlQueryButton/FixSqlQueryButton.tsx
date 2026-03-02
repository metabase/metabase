import { t } from "ttag";

import { useMetabotEnabledEmbeddingAware } from "metabase/metabot/hooks";
import { Button } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { trackQueryFixClicked } from "../../analytics";

type FixSqlQueryButtonProps = {
  rawSql?: string | null;
  errorMessage?: string | null;
};

export function FixSqlQueryButton({
  rawSql,
  errorMessage,
}: FixSqlQueryButtonProps) {
  const isMetabotEnabled = useMetabotEnabledEmbeddingAware();
  const { submitInput } = useMetabotAgent("omnibot");

  if (!isMetabotEnabled) {
    return null;
  }

  const handleClick = () => {
    trackQueryFixClicked();
    submitInput("Fix this SQL query");
  };

  return <Button onClick={handleClick}>{t`Have Metabot fix it`}</Button>;
}
