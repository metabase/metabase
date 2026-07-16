import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { BaseUpsellPage } from "metabase/monitor/upsells";

export const ToolsUpsell = () => {
  usePageTitle(t`Erroring questions`);

  return (
    <BaseUpsellPage
      campaign="audit-tools"
      location="settings-tools"
      header={t`Erroring questions`}
      title={t`Troubleshoot faster`}
      description={t`Find and fix issues fast, with an overview of all errors and model caching logs.`}
      image="app/assets/img/upsell-performance-tools.png"
    />
  );
};
