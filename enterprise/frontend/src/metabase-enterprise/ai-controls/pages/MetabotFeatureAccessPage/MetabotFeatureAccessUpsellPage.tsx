import { t } from "ttag";

import { MetabotUpsellPage } from "../MetabotUpsellPage";

export function MetabotFeatureAccessUpsellPage() {
  return (
    <MetabotUpsellPage
      campaign="ai-controls-usage-controls"
      location="ai-controls-usage-controls-page"
      title={t`Set AI usage limits and controls`}
      description={t`Decide which groups can use which AI features, and set sensible limits on usage based on tokens, messages, or dollar spend.`}
      image="app/assets/img/upsell-ai-usage-controls.png"
    />
  );
}
