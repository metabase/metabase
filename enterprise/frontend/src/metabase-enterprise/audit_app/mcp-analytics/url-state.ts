import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";

import {
  type FilterUrlState,
  filterUrlStateConfig,
  mergeUrlStateConfig,
} from "../metabot-analytics/components/ConversationFilters/url-state";

export type McpTab = "charts" | "events";

type McpPageUrlState = {
  tab: McpTab;
};

export type McpUrlState = FilterUrlState & McpPageUrlState;

const DEFAULT_TAB: McpTab = "charts";

/** Parse the `tab` query param, defaulting to the charts tab for any unrecognized value. */
function parseTab(param: QueryParam): McpTab {
  return getFirstParamValue(param) === "events" ? "events" : DEFAULT_TAB;
}

const mcpPageUrlStateConfig: UrlStateConfig<McpPageUrlState> = {
  parse: (query) => ({
    tab: parseTab(query.tab),
  }),
  serialize: ({ tab }) => ({
    tab: tab === DEFAULT_TAB ? undefined : tab,
  }),
};

export const mcpUrlStateConfig: UrlStateConfig<McpUrlState> =
  mergeUrlStateConfig(filterUrlStateConfig, mcpPageUrlStateConfig);
