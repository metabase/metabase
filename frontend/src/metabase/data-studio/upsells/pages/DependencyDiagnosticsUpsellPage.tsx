import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { BaseUpsellPage } from "./BaseUpsellPage";

export function DependencyDiagnosticsUpsellPage() {
  usePageTitle(t`Dependency diagnostics`);

  return (
    <BaseUpsellPage
      campaign="data-studio-dependency-diagnostics"
      location="data-studio-dependency-diagnostics-page"
      header={t`Dependency diagnostics`}
      title={t`Find and fix broken dependencies without hunting them down`}
      description={t`Detect broken dependencies across datasets and dashboards, and resolve issues without checking everything manually.`}
      image="app/assets/img/data-studio-dependency-diagnostics-upsell.svg"
      variant="image-full-height"
    />
  );
}
