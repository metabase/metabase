import { useMemo } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Button, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useAuditTable } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAuditTable";
import * as Lib from "metabase-lib";

type NewQuestionButtonProps = {
  viewName: string;
  /** Narrows the view to the rows the page shows, for a view other pages share. */
  scopeQuery?: (query: Lib.Query) => Lib.Query;
};

export function NewQuestionButton({
  viewName,
  scopeQuery,
}: NewQuestionButtonProps) {
  const { provider, table } = useAuditTable(viewName);

  const url = useMemo(() => {
    if (provider == null || table == null) {
      return null;
    }
    const query = Lib.queryFromTableOrCardMetadata(provider, table);
    return Urls.newQuestion({
      dataset_query: Lib.toJsQuery(scopeQuery ? scopeQuery(query) : query),
      mode: "notebook",
    });
  }, [provider, scopeQuery, table]);

  if (url == null) {
    return null;
  }

  return (
    <Button
      component={ForwardRefLink}
      to={url}
      variant="default"
      leftSection={<Icon name="insight" />}
    >
      {t`Query this data`}
    </Button>
  );
}
