import {
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
  DATA_APP_LOG_COLUMNS,
  DEFAULT_SORTING,
  type DataAppEntityType,
  type DataAppLogColumn,
  parseDataAppEntityType,
} from "./query-utils";

type DataAppLogUrlState = {
  /** The data app's slug. */
  app: string | null;
  type: DataAppEntityType | null;
  /** Current page of the log table, 0-indexed. */
  page: number;
  sort_column: DataAppLogColumn;
  sort_direction: SortDirection;
};

export type DataAppsAnalyticsUrlState = FilterUrlState & DataAppLogUrlState;

const dataAppLogUrlStateConfig: UrlStateConfig<DataAppLogUrlState> = {
  parse: (query) => ({
    app: getFirstParamValue(query.app)?.trim() || null,
    type: parseDataAppEntityType(getFirstParamValue(query.type)),
    page: parsePage(query.page),
    sort_column: parseSortColumn(
      query.sort_column,
      DATA_APP_LOG_COLUMNS,
      DEFAULT_SORTING.sort_column,
    ),
    sort_direction: parseSortDirection(
      query.sort_direction,
      DEFAULT_SORTING.sort_direction,
    ),
  }),
  serialize: ({ app, type, page, sort_column, sort_direction }) => ({
    app: app ?? undefined,
    type: type ?? undefined,
    page: page === 0 ? undefined : String(page),
    sort_column:
      sort_column === DEFAULT_SORTING.sort_column ? undefined : sort_column,
    sort_direction:
      sort_direction === DEFAULT_SORTING.sort_direction
        ? undefined
        : sort_direction,
  }),
};

export const dataAppsAnalyticsUrlStateConfig: UrlStateConfig<DataAppsAnalyticsUrlState> =
  mergeUrlStateConfig(filterUrlStateConfig, dataAppLogUrlStateConfig);
