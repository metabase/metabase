import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { DataStudioUpsellPage } from "./DataStudioUpsellPage";

export function DependencyDiagnosticsUpsellPage() {
  usePageTitle(t`Dependency diagnostics`);

  return (
    <DataStudioUpsellPage
      campaign="data-studio-dependency-diagnostics"
      location="data-studio-dependency-diagnostics-page"
      header={t`Dependency diagnostics`}
      title={t`See how everything connects`}
      description={t`Better manage your data transformation and entity graph by inspecting it visually, understanding relationships and dependencies.`}
      image="app/assets/img/data-studio-dependencies-upsell.png"
    />
  );
}
