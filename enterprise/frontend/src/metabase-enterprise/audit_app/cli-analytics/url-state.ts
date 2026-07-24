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

import { CLI_EVENT_SORT_COLUMNS, type CliEventSortColumn } from "./query-utils";

export type CliTab = "charts" | "events";

type CliPageUrlState = {
  tab: CliTab;
  /** Current page of the row-level events table, 0-indexed. */
  page: number;
  sort_column: CliEventSortColumn;
  sort_direction: SortDirection;
};

export type CliUrlState = FilterUrlState & CliPageUrlState;

const DEFAULT_TAB: CliTab = "charts";
const DEFAULT_SORT_COLUMN: CliEventSortColumn = "created_at";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

/** Parse the `tab` query param, defaulting to the charts tab for any unrecognized value. */
function parseTab(param: QueryParam): CliTab {
  return getFirstParamValue(param) === "events" ? "events" : DEFAULT_TAB;
}

/** Parse the `page` query param, defaulting to 0 for anything missing or invalid. */
function parsePage(param: QueryParam): number {
  const parsed = parseInt(getFirstParamValue(param) || "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseSortColumn(param: QueryParam): CliEventSortColumn {
  const value = getFirstParamValue(param);
  return (
    CLI_EVENT_SORT_COLUMNS.find((col) => col === value) ?? DEFAULT_SORT_COLUMN
  );
}

function parseSortDirection(param: QueryParam): SortDirection {
  const value = getFirstParamValue(param);
  // we don't want to use `value` directly because it may be an invalid sort direction
  // coming from URL params
  return value === "asc" || value === "desc" ? value : DEFAULT_SORT_DIRECTION;
}

const cliPageUrlStateConfig: UrlStateConfig<CliPageUrlState> = {
  parse: (query) => ({
    tab: parseTab(query.tab),
    page: parsePage(query.page),
    sort_column: parseSortColumn(query.sort_column),
    sort_direction: parseSortDirection(query.sort_direction),
  }),
  serialize: ({ tab, page, sort_column, sort_direction }) => ({
    tab: tab === DEFAULT_TAB ? undefined : tab,
    page: page === 0 ? undefined : String(page),
    sort_column: sort_column === DEFAULT_SORT_COLUMN ? undefined : sort_column,
    sort_direction:
      sort_direction === DEFAULT_SORT_DIRECTION ? undefined : sort_direction,
  }),
};

export const cliUrlStateConfig: UrlStateConfig<CliUrlState> =
  mergeUrlStateConfig(filterUrlStateConfig, cliPageUrlStateConfig);
