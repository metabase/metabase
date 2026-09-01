import {
  type UrlStateConfig,
  parsePage,
  parseSortColumn,
  parseSortDirection,
} from "metabase/common/hooks/use-url-state";
import type { SortDirection } from "metabase-types/api";

import {
  CONVERSATION_SORT_COLUMNS,
  type ConversationSortColumn,
} from "../../types";
import {
  type FilterUrlState,
  filterUrlStateConfig,
  mergeUrlStateConfig,
} from "../ConversationFilters/url-state";

export const PAGE_SIZE = 25;

const DEFAULT_SORT_COLUMN: ConversationSortColumn = "created_at";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

type PageUrlState = {
  page: number;
  sort_column: ConversationSortColumn;
  sort_direction: SortDirection;
};

export type UrlState = FilterUrlState & PageUrlState;

const pageUrlStateConfig: UrlStateConfig<PageUrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    sort_column: parseSortColumn(
      query.sort_column,
      CONVERSATION_SORT_COLUMNS,
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

export const urlStateConfig: UrlStateConfig<UrlState> = mergeUrlStateConfig(
  filterUrlStateConfig,
  pageUrlStateConfig,
);
