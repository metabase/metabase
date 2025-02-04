import { PLUGIN_AI_SQL_FIXER } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { FixSqlButton } from "./components/FixSqlButton";

if (hasPremiumFeature("metabot_v3")) {
  PLUGIN_AI_SQL_FIXER.FixSqlButton = FixSqlButton;
}
