import { PLUGIN_AI_SQL_FIXER } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { FixSqlQueryButton } from "./components/FixSqlQueryButton";

/**
 * Initialize ai-sql-fixer plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  // TODO TODO: clean up
  if (hasPremiumFeature("ai_sql_fixer") || !!true) {
    PLUGIN_AI_SQL_FIXER.FixSqlQueryButton = FixSqlQueryButton;
  }
}
