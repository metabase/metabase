import type {
  MetadataGenerationEstimate,
  MetadataGenerationRun,
} from "metabase-types/api";

export const createMockMetadataGenerationRun = (
  opts?: Partial<MetadataGenerationRun>,
): MetadataGenerationRun => ({
  id: 1,
  database_id: 1,
  scope: { type: "database" },
  attributes: ["data_sensitivity", "semantic_type"],
  status: "running",
  is_active: true,
  total_tables: 10,
  done_tables: 0,
  failed_tables: 0,
  table_errors: null,
  message: null,
  usage: null,
  creator_id: 1,
  created_at: "2026-10-09T00:00:00Z",
  updated_at: "2026-10-09T00:00:00Z",
  started_at: "2026-10-09T00:00:00Z",
  ended_at: null,
  last_heartbeat: "2026-10-09T00:00:00Z",
  ...opts,
});

export const createMockMetadataGenerationEstimate = (
  opts?: Partial<MetadataGenerationEstimate>,
): MetadataGenerationEstimate => ({
  table_count: 10,
  field_count: 200,
  total_tokens: 86600,
  cost_usd: 0.134,
  unavailable_reason: null,
  ...opts,
});
