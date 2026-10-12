import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { BaseUpsellPage } from "metabase/monitor/upsells";

export function ContentDiagnosticsUpsellPage() {
  usePageTitle(t`Content diagnostics`);

  return (
    <BaseUpsellPage
      campaign="monitor-content-diagnostics"
      location="monitor-content-diagnostics-page"
      header={t`Content diagnostics`}
      title={t`Find and clean up stale content without hunting it down`}
      description={t`Surface questions and dashboards that have gone stale so you can keep your instance clean and tidy.`}
      variant="image-card"
    />
  );
}
