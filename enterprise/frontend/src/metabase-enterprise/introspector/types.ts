export type IntrospectorCondition = "stale" | "broken" | "unreferenced";

export type IntrospectorEntityType = "cards" | "dashboards" | "transforms";

/**
 * Spike-aligned single-select flag pill for the Transforms tab.
 *
 * - `all` — return any flagged row (default)
 * - `broken` — has at least one broken-signal reason
 * - `stale` — orphaned output (no downstream dependents) AND not broken
 *
 * Maps to the existing `?conditions=` query param: `broken` → `broken`,
 * `stale` → `unreferenced` (introspector's existing semantic for no-inbound-deps),
 * `all` → no `conditions` filter.
 */
export type TransformsFlagFilter = "all" | "broken" | "stale";

/**
 * Per-row reason for the Transforms tab. Populated by the backend for any transform
 * whose `is_broken = 1`. Multiple reasons can be present on the same transform
 * (e.g. target table dropped *and* analysis-finding errors).
 *
 * Matches `docs/developers-guide/transforms-admin-cleanup-spike.md` — the spike's
 * `flag` field is always `"broken"` in v1 since `:stale` for transforms is the same
 * as `:unreferenced` here and contributes no reasons.
 */
export interface TransformReason {
  flag: "broken";
  code: "analysis-finding-error" | "target-table-missing" | "latest-run-failed";
  detail: string;
}

export interface TransformTargetTable {
  id: number;
  name: string;
  schema: string | null;
  db_id: number;
  db_name: string | null;
  active: boolean;
}

export interface TransformLastRun {
  status: string; // succeeded | failed | canceled | timeout
  start_time: string | null;
  end_time: string | null;
  message: string | null;
  /** Computed server-side from end_time - start_time. May be null for in-flight or single-instant runs. */
  duration_ms: number | null;
}

export interface TransformCreator {
  id: number;
  common_name: string;
}

export type TransformFlag = "broken" | "stale";

/** Source type extracted from the transform's `source` JSON column (`query` / `native` / `python`). */
export type TransformSourceType = "query" | "native" | "python" | string | null;

export interface IntrospectorListParams {
  conditions?: string; // comma-separated
  "stale-before"?: string; // yyyy-MM-dd
  "collection-id"?: number;
  "include-personal"?: boolean;
  search?: string;
  "sort-column"?: "name" | "last_used_at";
  "sort-direction"?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface IntrospectorRow {
  id: number;
  name: string;
  description: string | null;
  collection_id: number | null;
  /**
   * Parent collection's display name (from the LEFT JOIN on `collection`).
   * `null` when the row lives in the root (collection_id IS NULL) or when the
   * row's entity type doesn't carry a collection (transforms today).
   */
  collection_name: string | null;
  last_used_at: string | null;
  is_stale: number;
  is_broken: number;
  is_unreferenced: number;
  // entity-type-specific extras
  dashboard_id?: number | null;
  display?: string | null;
  type?: string | null;
  archived?: boolean;
  source_database_id?: number;
  target_table_id?: number | null;
  creator_id?: number;
  created_at?: string;
  updated_at?: string;
  // Transforms tab extras — empty/null on cards & dashboards.
  reasons?: TransformReason[];
  target_table?: TransformTargetTable | null;
  last_run?: TransformLastRun | null;
  creator?: TransformCreator | null;
  dependent_count?: number;
  transform_type?: TransformSourceType;
  flags?: TransformFlag[];
  can_write?: boolean;
  can_delete?: boolean;
}

export interface IntrospectorListResponse {
  rows: IntrospectorRow[];
  total: number;
}

export interface IntrospectorSummary {
  cards: ConditionCounts;
  dashboards: ConditionCounts;
  transforms: ConditionCounts;
}

export interface ConditionCounts {
  broken: number;
  stale: number;
  unreferenced: number;
  healthy: number;
}
