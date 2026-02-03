import { t } from "ttag";

import { DataStudioUpsellPage } from "./DataStudioUpsellPage";

export function DependenciesUpsellPage() {
  return (
    <DataStudioUpsellPage
      campaign="data-studio-dependencies"
      location="data-studio-dependencies-page"
      title={t`See how everything connects`}
      description={t`Better manage your data transformation and entity graph by inspecting it visually, understanding relationships and dependencies.`}
    />
  );
}
