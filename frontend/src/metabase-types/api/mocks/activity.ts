import type {
  PopularItem,
  RecentCollectionItem,
  RecentTableDatabaseInfo,
  RecentTableItem,
} from "metabase-types/api";

export const createMockRecentTableItem = (
  opts?: Partial<RecentTableItem>,
): RecentTableItem => ({
  id: 1,
  model: "table",
  name: "my_cool_table",
  display_name: "My Cool Table",
  timestamp: "2021-03-01T00:00:00.000Z",
  table_schema: "PUBLIC",
  database: createMockRecentTableDatabaseInfo(),
  ...opts,
});

export const createMockRecentTableDatabaseInfo = (
  opts?: Partial<RecentTableDatabaseInfo>,
): RecentTableDatabaseInfo => ({
  id: 1,
  name: "My Cool Database",
  initial_sync_status: "complete",
  ...opts,
});

export const createMockRecentCollectionItem = (
  opts?: Partial<RecentCollectionItem>,
): RecentCollectionItem => ({
  id: 1,
  model: "card",
  name: "My Cool Question",
  timestamp: "2021-03-01T00:00:00.000Z",
  can_write: true,
  parent_collection: {
    id: 1,
    name: "My Cool Collection",
  },
  ...opts,
});

export const createMockPopularTableItem = (
  opts?: Partial<RecentTableItem>,
): PopularItem => createMockRecentTableItem(opts);

export const createMockPopularCollectionItem = (
  opts?: Partial<RecentCollectionItem>,
): PopularItem => createMockRecentCollectionItem(opts);
