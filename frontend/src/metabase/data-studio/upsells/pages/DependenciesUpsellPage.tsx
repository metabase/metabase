import { t } from "ttag";

import dependenciesUpsellImage from "assets/img/data-studio-dependencies-upsell.png";
import { usePageTitle } from "metabase/hooks/use-page-title";

import { BaseUpsellPage } from "./BaseUpsellPage";

export function DependenciesUpsellPage() {
  usePageTitle(t`Dependency graph`);

  return (
    <BaseUpsellPage
      campaign="data-studio-dependencies"
      location="data-studio-dependencies-page"
      header={t`Dependency graph`}
      title={t`See how everything connects`}
      description={t`Better manage your data transformation and entity graph by inspecting it visually, understanding relationships and dependencies.`}
      image={dependenciesUpsellImage}
    />
  );
}
