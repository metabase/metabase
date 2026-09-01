import {
  type UrlStateConfig,
  parsePage,
  parseSortColumn,
  parseSortDirection,
} from "metabase/common/hooks/use-url-state";
import {
  type FilterUrlState,
  filterUrlStateConfig,
  mergeUrlStateConfig,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationFilters/url-state";
import type { SortDirection } from "metabase-types/api";

import { CLI_EVENT_SORT_COLUMNS, type CliEventSortColumn } from "./query-utils";

type CliEventsUrlState = {
  /** Current page of the row-level events table, 0-indexed. */
  page: number;
  sort_column: CliEventSortColumn;
  sort_direction: SortDirection;
};

export type CliUrlState = FilterUrlState & CliEventsUrlState;

const DEFAULT_SORT_COLUMN: CliEventSortColumn = "created_at";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

const cliEventsUrlStateConfig: UrlStateConfig<CliEventsUrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    sort_column: parseSortColumn(
      query.sort_column,
      CLI_EVENT_SORT_COLUMNS,
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

export const cliUrlStateConfig: UrlStateConfig<CliUrlState> =
  mergeUrlStateConfig(filterUrlStateConfig, cliEventsUrlStateConfig);
