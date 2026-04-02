import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type { SortDirection } from "metabase-types/api";

import type { ConversationSortColumn } from "../../types";

export const PAGE_SIZE = 50;

const DEFAULT_SORT_COLUMN: ConversationSortColumn = "created_at";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";
const DEFAULT_DATE = "7";
const ALL_USERS_GROUP_ID = 1;

export type UrlState = {
  page: number;
  sort_column: ConversationSortColumn;
  sort_direction: SortDirection;
  date: string | null;
  user: string | null;
  group: string | null;
  profile: string | null;
};

export const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    sort_column: parseSortColumn(query.sort_column),
    sort_direction: parseSortDirection(query.sort_direction),
    date: parseString(query.date) ?? DEFAULT_DATE,
    user: parseString(query.user),
    group: parseString(query.group) ?? String(ALL_USERS_GROUP_ID),
    profile: parseString(query.profile),
  }),
  serialize: ({
    page,
    sort_column,
    sort_direction,
    date,
    user,
    group,
    profile,
  }) => ({
    page: page === 0 ? undefined : String(page),
    sort_column: sort_column === DEFAULT_SORT_COLUMN ? undefined : sort_column,
    sort_direction:
      sort_direction === DEFAULT_SORT_DIRECTION ? undefined : sort_direction,
    date: date === DEFAULT_DATE ? undefined : (date ?? undefined),
    user: user ?? undefined,
    group:
      group === String(ALL_USERS_GROUP_ID) ? undefined : (group ?? undefined),
    profile: profile ?? undefined,
  }),
};

function parsePage(param: QueryParam): number {
  const value = getFirstParamValue(param);
  const parsed = parseInt(value || "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseSortColumn(param: QueryParam): ConversationSortColumn {
  const value = getFirstParamValue(param);
  return value && isSortColumn(value) ? value : DEFAULT_SORT_COLUMN;
}

function isSortColumn(value: string): value is ConversationSortColumn {
  return ["created_at", "message_count", "total_tokens"].includes(value);
}

function parseSortDirection(param: QueryParam): SortDirection {
  const value = getFirstParamValue(param);
  return value === "asc" ? "asc" : DEFAULT_SORT_DIRECTION;
}

function parseString(param: QueryParam): string | null {
  const value = getFirstParamValue(param);
  return value && value.trim().length > 0 ? value.trim() : null;
}
