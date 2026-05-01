import { t } from "ttag";

import { MetabotUpsellPage } from "../MetabotUpsellPage";

export function MetabotCustomizationUpsellPage() {
  return (
    <MetabotUpsellPage
      feature="ai_controls"
      campaign="ai_controls"
      source="ai_controls"
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This upsell refers to the Metabase product.
      title={t`Pick the look and feel of Metabase’s AI agent`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This upsell refers to the Metabase product.
      description={t`Customize the name, icon, and illustrations used in AI chat experiences in Metabase.`}
      image="app/assets/img/upsell-ai-customization.png"
    />
  );
}
