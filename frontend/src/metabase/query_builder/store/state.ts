import type { timelineApi } from "metabase/api";
import type { getEmbedOptions } from "metabase/embedding/interactive-embedding";
import type { getMetadata } from "metabase/metadata-store";
import type { QueryBuilderState } from "metabase/redux/store/qb";
import type { getSetting } from "metabase/settings";

/**
 * The state the query builder's selectors read: its own slice, plus whatever
 * the foreign selectors they compose ask for. Each foreign view is derived from
 * that selector's own parameter type, so it narrows on its own as those modules
 * stop reading the global `State`.
 */
export type QueryBuilderStoreState = { qb: QueryBuilderState } & Parameters<
  typeof getMetadata
>[0] &
  Parameters<typeof getSetting>[0] &
  Parameters<typeof getEmbedOptions>[0] &
  Parameters<ReturnType<typeof timelineApi.endpoints.listTimelines.select>>[0];
