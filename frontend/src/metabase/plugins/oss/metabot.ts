import type React from "react";

import type {
  UseMetabotSQLSuggestionOptions,
  useMetabotSQLSuggestion as useMetabotSQLSuggestionType,
} from "metabase/metabot/hooks/use-metabot-sql-suggestion-oss";

export type PluginMetabotType = {
  hasFeature: boolean;
  useMetabotSQLSuggestion: typeof useMetabotSQLSuggestionType;
  getAdminRoutes: (() => React.ReactElement[]) | null;
  getMetabotRoutes: () => React.ReactElement | null;
  getMetabotQueryBuilderRoute: () => React.ReactElement | null;
};

const getDefaultPluginMetabot = (): PluginMetabotType => ({
  hasFeature: false,
  useMetabotSQLSuggestion: (options: UseMetabotSQLSuggestionOptions) => {
    // lazy require to avoid loading metabase/api and its cljs dependencies at
    // module init time. without this the jest unit tests will break.
    const {
      useMetabotSQLSuggestion,
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
    } =
      require("metabase/metabot/hooks/use-metabot-sql-suggestion-oss") as typeof import("metabase/metabot/hooks/use-metabot-sql-suggestion-oss");
    return useMetabotSQLSuggestion(options);
  },
  getAdminRoutes: null,
  getMetabotRoutes: () => null,
  getMetabotQueryBuilderRoute: () => null,
});

export const PLUGIN_METABOT: PluginMetabotType = getDefaultPluginMetabot();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_METABOT, getDefaultPluginMetabot());
}
