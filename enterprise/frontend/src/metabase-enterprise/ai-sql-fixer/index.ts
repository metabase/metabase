import { PLUGIN_AI_SQL_FIXER } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { FixSqlButton } from "./components/FixSqlButton";

if (hasPremiumFeature("ai_sql_fixer")) {
  PLUGIN_AI_SQL_FIXER.FixSqlButton = FixSqlButton;
}
