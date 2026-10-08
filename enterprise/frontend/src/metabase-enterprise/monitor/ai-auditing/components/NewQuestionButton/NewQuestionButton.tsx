import { useMemo } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Button, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useAuditTable } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAuditTable";
import { useCanQueryAuditTable } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useCanQueryAuditTable";
import * as Lib from "metabase-lib";

type NewQuestionButtonProps = {
  viewName: string;
};

export function NewQuestionButton({ viewName }: NewQuestionButtonProps) {
  const canQuery = useCanQueryAuditTable(viewName);
  const { provider, table } = useAuditTable(viewName);

  const url = useMemo(() => {
    if (provider == null || table == null) {
      return null;
    }
    const query = Lib.queryFromTableOrCardMetadata(provider, table);
    return Urls.newQuestion({
      dataset_query: Lib.toJsQuery(query),
      mode: "notebook",
    });
  }, [provider, table]);

  if (!canQuery || url == null) {
    return null;
  }

  return (
    <Button
      component={ForwardRefLink}
      to={url}
      variant="subtle"
      size="compact-md"
      leftSection={<Icon name="insight" />}
    >
      {t`New question`}
    </Button>
  );
}
