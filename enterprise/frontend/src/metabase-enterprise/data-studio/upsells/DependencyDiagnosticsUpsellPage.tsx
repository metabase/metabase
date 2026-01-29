import { t } from "ttag";

import { DataStudioUpsellPage } from "./DataStudioUpsellPage";

export function DependencyDiagnosticsUpsellPage() {
  return (
    <DataStudioUpsellPage
      campaign="data-studio-dependency-diagnostics"
      location="data-studio-dependency-diagnostics-page"
      title={t`See how everything connects`}
      description={t`Better manage your data transformation and entity graph by inspecting it visually, understanding relationships and dependencies.`}
      image="app/assets/img/data-studio-dependencies-upsell.png"
    />
  );
}
