import type { ModelCacheRefreshStatus } from "metabase-types/api";

export const getMockModelCacheInfo = (
  opts?: Partial<ModelCacheRefreshStatus>,
): ModelCacheRefreshStatus => {
  const now = new Date();

  const past = new Date();
  past.setMinutes(now.getMinutes() - 30);

  const future = new Date();
  future.setHours(now.getHours() + 1);

  return {
    id: 1,
    state: "persisted",
    error: null,
    active: true,

    card_id: 1,
    card_name: "Test Model",

    collection_id: "root",
    collection_name: "Our analytics",
    collection_authority_level: null,

    columns: [],
    database_id: 1,
    database_name: "Sample Database",
    schema_name: "PUBLIC",
    table_name: "Orders",

    refresh_begin: past.toISOString(),
    refresh_end: now.toISOString(),
    "next-fire-time": future.toISOString(),

    ...opts,
  };
};
