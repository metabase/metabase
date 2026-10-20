import type { TabSortConfig } from "metabase/monitor/tab-change";
import type { OAuthClientSortColumn, SortDirection } from "metabase-types/api";

import type { OAuthClientsTab } from "./types";

export const PAGE_SIZE = 50;

export const DEFAULT_TAB: OAuthClientsTab = "active";

export const DEFAULT_SORT_COLUMN: OAuthClientSortColumn = "created_at";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

export const TAB_SORT_COLUMNS: Record<
  OAuthClientsTab,
  OAuthClientSortColumn[]
> = {
  active: [
    "created_at",
    "client_name",
    "live_tokens",
    "user_count",
    "last_used_at",
  ],
  revoked: ["created_at", "client_name", "revoked_at"],
};

export const TAB_SORT_CONFIG: TabSortConfig<
  OAuthClientsTab,
  OAuthClientSortColumn
> = {
  tabSortColumns: TAB_SORT_COLUMNS,
  defaultSortColumn: DEFAULT_SORT_COLUMN,
  defaultSortDirection: DEFAULT_SORT_DIRECTION,
};
