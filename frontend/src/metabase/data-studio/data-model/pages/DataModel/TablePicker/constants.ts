import type { IconName } from "metabase-types/api";

import type { FilterState, ItemType } from "./types";

export const TYPE_ICONS: Record<ItemType, IconName> = {
  table: "table2",
  schema: "folder",
  database: "database",
};

export const EMPTY_FILTERS: FilterState = {
  dataLayer: null,
  dataSource: null,
  ownerEmail: null,
  ownerUserId: null,
  unusedOnly: null,
  publishedOnly: null,
  needsReviewOnly: null,
  hiddenOnly: null,
  noMainDateOnly: null,
  noRoleOnly: null,
};
