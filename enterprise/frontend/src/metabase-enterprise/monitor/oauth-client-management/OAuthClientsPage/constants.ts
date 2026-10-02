import type { OAuthClientSortColumn, SortDirection } from "metabase-types/api";

import type { OAuthClientsTab } from "./types";

export const PAGE_SIZE = 50;

export const DEFAULT_TAB: OAuthClientsTab = "active";

export const DEFAULT_SORT_COLUMN: OAuthClientSortColumn = "created_at";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

// The Revoked tab trades the Users and Live tokens columns for who revoked the client and when, so neither tab can
// sort by a column the other one shows
export const TAB_SORT_COLUMNS: Record<
  OAuthClientsTab,
  OAuthClientSortColumn[]
> = {
  active: ["created_at", "client_name", "live_tokens", "user_count"],
  revoked: ["created_at", "client_name", "revoked_at"],
};
