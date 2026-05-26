import { t } from "ttag";

import { MetabotUpsellPage } from "../MetabotUpsellPage";

export function MetabotSystemPromptsUpsellPage() {
  return (
    <MetabotUpsellPage
      campaign="ai-controls-system-prompts"
      location="ai-controls-system-prompts-page"
      title={t`Write custom instructions for each AI feature`}
      description={t`SQL code generation, natural language queries, and agent chat can each be customized with your own prompts.`}
      image="app/assets/img/upsell-ai-system-prompts.png"
    />
  );
}
