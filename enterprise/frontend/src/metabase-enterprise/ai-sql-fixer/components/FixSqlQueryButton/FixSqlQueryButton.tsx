import { t } from "ttag";

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
  const { submitInput } = useMetabotAgent("omnibot");

  const handleClick = () => {
    trackQueryFixClicked();
    const promptParts = ["Fix this SQL query"];
    if (errorMessage) {
      promptParts.push(`The database returned this error: ${errorMessage}`);
    }
    if (rawSql) {
      promptParts.push(`SQL:\n${rawSql}`);
    }
    submitInput(promptParts.join("\n\n"));
  };

  return <Button onClick={handleClick}>{t`Have Metabot fix it`}</Button>;
}
