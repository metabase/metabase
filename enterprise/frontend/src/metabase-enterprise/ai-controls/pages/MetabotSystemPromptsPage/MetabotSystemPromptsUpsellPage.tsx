import { t } from "ttag";

import { MetabotUpsellPage } from "../MetabotUpsellPage";

export function MetabotSystemPromptsUpsellPage() {
  return (
    <MetabotUpsellPage
      campaign="ai_controls"
      source="ai_controls"
      title={t`Write custom instructions for each AI feature`}
      description={t`SQL code generation, natural language queries, and agent chat can each be customized with your own prompts.`}
      image="app/assets/img/upsell-ai-system-prompts.png"
    />
  );
}
