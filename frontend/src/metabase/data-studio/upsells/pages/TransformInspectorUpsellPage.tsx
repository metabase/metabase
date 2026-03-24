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
      title={t`Get a diagnostic view of how your transforms process data`}
      description={t`Inspect input and output shapes, join behavior, and column distributions to catch data quality issues before they cause problems downstream.`}
    />
  );
}
