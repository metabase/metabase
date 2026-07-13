import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type { SortDirection } from "metabase-types/api";

import {
  type FilterUrlState,
  filterUrlStateConfig,
  mergeUrlStateConfig,
} from "../metabot-analytics/components/ConversationFilters/url-state";

import { MCP_EVENT_SORT_COLUMNS, type McpEventSortColumn } from "./query-utils";

export type McpTab = "charts" | "events";

type McpPageUrlState = {
  tab: McpTab;
  /** Current page of the row-level events table, 0-indexed. */
  page: number;
  sortColumn: McpEventSortColumn;
  sortDirection: SortDirection;
};

export type McpUrlState = FilterUrlState & McpPageUrlState;

const DEFAULT_TAB: McpTab = "charts";
const DEFAULT_SORT_COLUMN: McpEventSortColumn = "created_at";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

/** Parse the `tab` query param, defaulting to the charts tab for any unrecognized value. */
function parseTab(param: QueryParam): McpTab {
  return getFirstParamValue(param) === "events" ? "events" : DEFAULT_TAB;
}

/** Parse the `page` query param, defaulting to 0 for anything missing or invalid. */
function parsePage(param: QueryParam): number {
  const parsed = parseInt(getFirstParamValue(param) || "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseSortColumn(param: QueryParam): McpEventSortColumn {
  const value = getFirstParamValue(param);
  return (
    MCP_EVENT_SORT_COLUMNS.find((col) => col === value) ?? DEFAULT_SORT_COLUMN
  );
}

function parseSortDirection(param: QueryParam): SortDirection {
  return getFirstParamValue(param) === "asc" ? "asc" : DEFAULT_SORT_DIRECTION;
}

const mcpPageUrlStateConfig: UrlStateConfig<McpPageUrlState> = {
  parse: (query) => ({
    tab: parseTab(query.tab),
    page: parsePage(query.page),
    sortColumn: parseSortColumn(query.sortColumn),
    sortDirection: parseSortDirection(query.sortDirection),
  }),
  serialize: ({ tab, page, sortColumn, sortDirection }) => ({
    tab: tab === DEFAULT_TAB ? undefined : tab,
    page: page === 0 ? undefined : String(page),
    sortColumn: sortColumn === DEFAULT_SORT_COLUMN ? undefined : sortColumn,
    sortDirection:
      sortDirection === DEFAULT_SORT_DIRECTION ? undefined : sortDirection,
  }),
};

export const mcpUrlStateConfig: UrlStateConfig<McpUrlState> =
  mergeUrlStateConfig(filterUrlStateConfig, mcpPageUrlStateConfig);
