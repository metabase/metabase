import { PLUGIN_AI_SQL_GENERATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { GenerateSqlQueryButton } from "./components/GenerateSqlQueryButton";
import { getPlaceholderText } from "./utils";

if (hasPremiumFeature("ai_sql_generation")) {
  PLUGIN_AI_SQL_GENERATION.GenerateSqlQueryButton = GenerateSqlQueryButton;
  PLUGIN_AI_SQL_GENERATION.isEnabled = () => true;
  PLUGIN_AI_SQL_GENERATION.getPlaceholderText = getPlaceholderText;
}
