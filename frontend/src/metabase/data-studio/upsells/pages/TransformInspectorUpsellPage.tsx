import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { BaseUpsellPage } from "./BaseUpsellPage";

export function TransformInspectorUpsellPage() {
  usePageTitle(t`Transform inspector`);

  return (
    <BaseUpsellPage
      campaign="data-studio-transform-inspector"
      location="data-studio-transform-inspector-page"
      header={t`Transform inspector`}
      title={t`See what's happening inside your transforms`}
      description={t`Get a diagnostic view of your transforms, so you can catch data quality issues before they cause problems downstream.`}
    />
  );
}
