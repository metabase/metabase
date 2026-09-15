import type { UrlStateConfig } from "metabase/common/hooks/use-url-state";
import {
  parsePage,
  parseSortColumn,
  parseSortDirection,
} from "metabase/common/hooks/use-url-state";
import type { AdminSessionListParams } from "metabase-types/api";

import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  SORT_COLUMN_VALUES,
} from "./constants";
import type { SessionsUrlState } from "./types";

export const urlStateConfig: UrlStateConfig<SessionsUrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    sort_column: parseSortColumn(
      query.sort_column,
      SORT_COLUMN_VALUES,
      DEFAULT_SORT_COLUMN,
    ),
    sort_direction: parseSortDirection(
      query.sort_direction,
      DEFAULT_SORT_DIRECTION,
    ),
  }),
  serialize: (state) => ({
    page: state.page === 0 ? undefined : String(state.page),
    sort_column:
      state.sort_column === DEFAULT_SORT_COLUMN ? undefined : state.sort_column,
    sort_direction:
      state.sort_direction === DEFAULT_SORT_DIRECTION
        ? undefined
        : state.sort_direction,
  }),
};

export const buildListParams = (
  state: SessionsUrlState,
  pageSize: number,
): AdminSessionListParams => ({
  limit: pageSize,
  offset: state.page * pageSize,
  "sort-column": state.sort_column,
  "sort-direction": state.sort_direction,
});
