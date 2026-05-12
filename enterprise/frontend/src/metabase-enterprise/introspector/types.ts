export type IntrospectorCondition = "stale" | "broken" | "unreferenced";

export type IntrospectorEntityType = "cards" | "dashboards" | "transforms";

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
  creator_id?: number;
  created_at?: string;
  updated_at?: string;
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
