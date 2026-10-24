import { SidebarPrototypePage } from "../shared/SidebarPrototypePage";

import { SEED_FORMULAS_BY_TABLE } from "./seed-formulas";
import { VARIANTS } from "./variants";

/**
 * `/prototypes/ai-expressions/<variant>?source=<id>`: the summarize sidebar's custom expression
 * surface, AI-written expressions and expression editing. Seed controls add hardcoded custom
 * aggregations for the Sample Database tables.
 */
export function AiExpressionsPrototypePage() {
  return (
    <SidebarPrototypePage
      basePath="/prototypes/ai-expressions"
      variants={VARIANTS}
      seedFormulasByTable={SEED_FORMULAS_BY_TABLE}
    />
  );
}
