import {
  type UrlStateConfig,
  parsePage,
  parseSortColumn,
  parseSortDirection,
} from "metabase/common/hooks/use-url-state";
import type { SortDirection } from "metabase-types/api";

import {
  type FilterUrlState,
  filterUrlStateConfig,
  mergeUrlStateConfig,
} from "../metabot-analytics/components/ConversationFilters/url-state";

import { MCP_EVENT_SORT_COLUMNS, type McpEventSortColumn } from "./query-utils";

type McpEventsUrlState = {
  /** Current page of the row-level events table, 0-indexed. */
  page: number;
  sort_column: McpEventSortColumn;
  sort_direction: SortDirection;
};

export type McpUrlState = FilterUrlState & McpEventsUrlState;

const DEFAULT_SORT_COLUMN: McpEventSortColumn = "created_at";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

const mcpEventsUrlStateConfig: UrlStateConfig<McpEventsUrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    sort_column: parseSortColumn(
      query.sort_column,
      MCP_EVENT_SORT_COLUMNS,
      DEFAULT_SORT_COLUMN,
    ),
    sort_direction: parseSortDirection(
      query.sort_direction,
      DEFAULT_SORT_DIRECTION,
    ),
  }),
  serialize: ({ page, sort_column, sort_direction }) => ({
    page: page === 0 ? undefined : String(page),
    sort_column: sort_column === DEFAULT_SORT_COLUMN ? undefined : sort_column,
    sort_direction:
      sort_direction === DEFAULT_SORT_DIRECTION ? undefined : sort_direction,
  }),
};

export const mcpUrlStateConfig: UrlStateConfig<McpUrlState> =
  mergeUrlStateConfig(filterUrlStateConfig, mcpEventsUrlStateConfig);
