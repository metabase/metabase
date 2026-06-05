import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { BaseUpsellPage } from "./BaseUpsellPage";

export function SchemaViewerUpsellPage() {
  usePageTitle(t`Schema viewer`);

  return (
    <BaseUpsellPage
      campaign="data-studio-schema-viewer"
      location="data-studio-schema-viewer-page"
      header={t`Schema viewer`}
      title={t`Visualize your database structure`}
      description={t`Explore tables and their relationships at a glance. Follow foreign keys, expand into related tables, and see how your schema fits together.`}
      image="app/assets/img/schema-viewer.svg"
    />
  );
}
