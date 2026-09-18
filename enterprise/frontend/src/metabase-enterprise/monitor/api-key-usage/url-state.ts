import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
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

import {
  API_KEY_USAGE_EVENT_SORT_COLUMNS,
  type ApiKeyUsageEventSortColumn,
} from "./query-utils";

type ApiKeyUsageEventsUrlState = {
  /** The API key an admin is scoping the page to — not part of the shared filter bar, so it's
   * tracked here rather than in `FilterUrlState`. */
  api_key: string | null;
  /** Current page of the row-level events table, 0-indexed. */
  page: number;
  sort_column: ApiKeyUsageEventSortColumn;
  sort_direction: SortDirection;
};

export type ApiKeyUsageUrlState = FilterUrlState & ApiKeyUsageEventsUrlState;

const DEFAULT_SORT_COLUMN: ApiKeyUsageEventSortColumn = "occurred_at";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

function parseApiKey(param: QueryParam): string | null {
  const value = getFirstParamValue(param);
  return value && value.trim().length > 0 ? value.trim() : null;
}

const apiKeyUsageEventsUrlStateConfig: UrlStateConfig<ApiKeyUsageEventsUrlState> =
  {
    parse: (query) => ({
      api_key: parseApiKey(query.api_key),
      page: parsePage(query.page),
      sort_column: parseSortColumn(
        query.sort_column,
        API_KEY_USAGE_EVENT_SORT_COLUMNS,
        DEFAULT_SORT_COLUMN,
      ),
      sort_direction: parseSortDirection(
        query.sort_direction,
        DEFAULT_SORT_DIRECTION,
      ),
    }),
    serialize: ({ api_key, page, sort_column, sort_direction }) => ({
      api_key: api_key ?? undefined,
      page: page === 0 ? undefined : String(page),
      sort_column:
        sort_column === DEFAULT_SORT_COLUMN ? undefined : sort_column,
      sort_direction:
        sort_direction === DEFAULT_SORT_DIRECTION ? undefined : sort_direction,
    }),
  };

export const apiKeyUsageUrlStateConfig: UrlStateConfig<ApiKeyUsageUrlState> =
  mergeUrlStateConfig(filterUrlStateConfig, apiKeyUsageEventsUrlStateConfig);
