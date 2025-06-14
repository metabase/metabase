import { t } from "ttag";

import { Button } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export function FixSqlQueryButton() {
  const { startNewConversation } = useMetabotAgent();

  const handleClick = () => {
    startNewConversation("Fix this SQL query");
  };

  return <Button onClick={handleClick}>{t`Have Metabot fix it`}</Button>;
}
