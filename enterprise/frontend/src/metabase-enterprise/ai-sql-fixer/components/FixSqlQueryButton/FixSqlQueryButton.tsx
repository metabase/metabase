import { t } from "ttag";

import { Button } from "metabase/ui";
import { useMetabotConversation } from "metabase-enterprise/metabot/hooks";

import { trackQueryFixClicked } from "../../analytics";

export function FixSqlQueryButton() {
  const { submitInput } = useMetabotConversation("omnibot");

  const handleClick = () => {
    trackQueryFixClicked();
    submitInput("Fix this SQL query");
  };

  return <Button onClick={handleClick}>{t`Have Metabot fix it`}</Button>;
}
