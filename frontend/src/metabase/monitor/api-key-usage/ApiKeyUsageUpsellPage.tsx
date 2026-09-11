import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { BaseUpsellPage } from "metabase/monitor/upsells";

export function ApiKeyUsageUpsellPage() {
  usePageTitle(t`API key usage`);

  return (
    <BaseUpsellPage
      campaign="monitor-api-key-usage"
      location="monitor-api-key-usage-page"
      header={t`API key usage`}
      title={t`See who's calling your API`}
      description={t`Track which API keys are active, who's using them, and which routes and clients they're calling — so you can spot stale keys and unexpected usage.`}
    />
  );
}
