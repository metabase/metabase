import { t } from "ttag";

import { BaseUpsellPage } from "./BaseUpsellPage";

export function LibraryUpsellPage() {
  return (
    <BaseUpsellPage
      campaign="data-studio-library"
      location="data-studio-library-page"
      header={t`Library`}
      title={t`Bring more order to your analytics`}
      description={t`Create a shared library of datasets and metrics your team can rely on, so things stay consistent as your data and downstream content grows.`}
      image="app/assets/img/data-studio-library-upsell.svg"
      variant="image-full-height"
    />
  );
}
