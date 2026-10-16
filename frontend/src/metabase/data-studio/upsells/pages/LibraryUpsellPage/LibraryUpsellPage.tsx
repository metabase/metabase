import { t } from "ttag";

import libraryUpsellImage from "assets/img/data-studio-library-upsell.svg";
import { getLibrarySectionName } from "metabase/common/data-studio/library-sections";
import type { LibraryCollectionType } from "metabase-types/api";

import { BaseUpsellPage } from "../../components/BaseUpsellPage";

type LibraryUpsellPageProps = {
  section?: LibraryCollectionType;
};

export function LibraryUpsellPage({
  section = "library",
}: LibraryUpsellPageProps) {
  return (
    <BaseUpsellPage
      campaign="data-studio-library"
      location="data-studio-library-page"
      header={getLibrarySectionName(section)}
      title={t`Bring more order to your analytics`}
      description={t`Create a shared semantic layer of datasets and metrics your team can rely on, so things stay consistent as your data and downstream content grows.`}
      image={libraryUpsellImage}
      variant="image-full-height"
    />
  );
}
