import { PLUGIN_SQL_GENERATION } from "metabase/querying/plugins";

import { FixSqlQueryButton } from "./components/FixSqlQueryButton";
import { MetabotPromptButton } from "./components/MetabotPromptButton";
import { useUserMetabotPermissions } from "./hooks";

function useHasSqlGenerationAccess() {
  return useUserMetabotPermissions().hasSqlGenerationAccess;
}

export function registerMetabotPlugins() {
  PLUGIN_SQL_GENERATION.PromptButton = MetabotPromptButton;
  PLUGIN_SQL_GENERATION.FixQueryButton = FixSqlQueryButton;
  PLUGIN_SQL_GENERATION.useHasAccess = useHasSqlGenerationAccess;
}
