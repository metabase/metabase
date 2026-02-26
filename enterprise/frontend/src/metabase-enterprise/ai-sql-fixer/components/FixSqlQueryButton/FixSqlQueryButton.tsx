import { t } from "ttag";

import { useSqlFixerInlinePrompt } from "metabase/query_builder/components/view/View/ViewMainContainer/SqlFixerInlinePromptContext";
import { Button } from "metabase/ui";

import { trackQueryFixClicked } from "../../analytics";

export function FixSqlQueryButton() {
  const { requestSqlFixPrompt, isLoading } = useSqlFixerInlinePrompt();

  if (!requestSqlFixPrompt) {
    return null;
  }

  const handleClick = () => {
    trackQueryFixClicked();
    // SQL and error message are included in the context.
    requestSqlFixPrompt("Fix this SQL query");
  };

  return (
    <Button loading={isLoading} onClick={handleClick}>
      {t`Have Metabot fix it`}
    </Button>
  );
}
