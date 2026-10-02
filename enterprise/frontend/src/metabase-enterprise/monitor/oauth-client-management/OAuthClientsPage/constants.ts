import type { OAuthClientSortColumn, SortDirection } from "metabase-types/api";

import type { OAuthClientsTab } from "./types";

export const PAGE_SIZE = 50;

export const DEFAULT_TAB: OAuthClientsTab = "active";

export const DEFAULT_SORT_COLUMN: OAuthClientSortColumn = "created_at";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";
