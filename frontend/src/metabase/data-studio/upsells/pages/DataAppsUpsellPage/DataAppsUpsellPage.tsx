import { t } from "ttag";

import dataAppsUpsellImage from "assets/img/upsell-data-apps.png";
import { usePageTitle } from "metabase/hooks/use-page-title";

import { BaseUpsellPage } from "../../components/BaseUpsellPage";

export function DataAppsUpsellPage() {
  usePageTitle(t`Data apps`);

  return (
    <BaseUpsellPage
      campaign="data-studio-data-apps"
      location="data-studio-data-apps-page"
      header={t`Data apps`}
      title={t`Build data apps`}
      description={t`Build custom user interfaces, forms, and other tools that write back to your database. Automate chores, manage back-office work, and set up workflows to act on your data, all built with AI on top of your semantic layer.`}
      image={dataAppsUpsellImage}
    />
  );
}
