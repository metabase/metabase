import { t } from "ttag";

import { MetabotUpsellPage } from "../MetabotUpsellPage";

export function MetabotCustomizationUpsellPage() {
  return (
    <MetabotUpsellPage
      campaign="ai-controls-customization"
      location="ai-controls-customization-page"
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This upsell refers to the Metabase product.
      title={t`Pick the look and feel of Metabase’s AI agent`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This upsell refers to the Metabase product.
      description={t`Customize the name, icon, and illustrations used in AI chat experiences in Metabase.`}
      image="app/assets/img/upsell-ai-customization.png"
    />
  );
}
