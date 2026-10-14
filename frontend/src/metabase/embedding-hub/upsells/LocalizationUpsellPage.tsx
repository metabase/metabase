import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";

import { BaseUpsellPage } from "./BaseUpsellPage";

export function LocalizationUpsellPage() {
  const hasContentTranslation = useHasTokenFeature("content_translation");

  if (hasContentTranslation) {
    return null;
  }

  return (
    <BaseUpsellPage
      campaign="content-translation"
      location="embedding-hub-localization"
      header={t`Localization`}
      title={t`Translate your embedded content`}
      description={t`Upload a translation dictionary to translate content such as item titles, headings, filter labels, and data in your embedded components.`}
      image="app/assets/img/upsell-embedding-localization.svg"
    />
  );
}
