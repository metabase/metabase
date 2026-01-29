import { t } from "ttag";

import { DataStudioUpsellPage } from "./DataStudioUpsellPage";

export function LibraryUpsellPage() {
  return (
    <DataStudioUpsellPage
      campaign="data-studio-library"
      location="data-studio-library-page"
      title={t`Bring more order to your analytics`}
      description={t`Create a shared library of datasets and metrics your team can rely on, so things stay consistent as your data and downstream content grows.`}
      image="app/assets/img/data-studio-library-upsell.png"
    />
  );
}
