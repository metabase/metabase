import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";

import { BaseUpsellPage } from "./BaseUpsellPage";

export function AppearanceUpsellPage() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  if (hasSimpleEmbedding) {
    return null;
  }

  return (
    <BaseUpsellPage
      campaign="embedding-themes"
      location="embedding-hub-appearance"
      header={t`Appearance`}
      title={t`Create custom themes`}
      description={t`Fine-tune the appearance of your embedded content with colors and fonts.`}
      image="app/assets/img/upsell-themes.png"
    />
  );
}
