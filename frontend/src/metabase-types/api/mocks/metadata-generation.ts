import type {
  MetadataGenerationApplyResult,
  MetadataGenerationEstimate,
  MetadataGenerationRun,
  MetadataGenerationRunTable,
  MetadataGenerationStatusCounts,
  MetadataGenerationSuggestion,
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

export const createMockMetadataGenerationStatusCounts = (
  opts?: Partial<MetadataGenerationStatusCounts>,
): MetadataGenerationStatusCounts => ({
  pending: 0,
  accepted: 0,
  rejected: 0,
  stale: 0,
  applied: 0,
  ...opts,
});

export const createMockMetadataGenerationRunTable = (
  opts?: Partial<MetadataGenerationRunTable>,
): MetadataGenerationRunTable => ({
  table_id: 1,
  table_name: "ORDERS",
  schema: "PUBLIC",
  total: 0,
  counts: createMockMetadataGenerationStatusCounts(),
  human_set_pending: 0,
  ...opts,
});

export const createMockMetadataGenerationSuggestion = (
  opts?: Partial<MetadataGenerationSuggestion>,
): MetadataGenerationSuggestion => ({
  id: 1,
  run_id: 1,
  table_id: 1,
  field_id: 1,
  field_name: "EMAIL",
  field_display_name: "Email",
  attribute: "data_sensitivity",
  source: "none",
  current_value: null,
  proposed_value: "PII",
  confidence: "high",
  reasoning: null,
  status: "pending",
  decided_by: null,
  decided_at: null,
  created_at: "2026-10-09T00:00:00Z",
  updated_at: "2026-10-09T00:00:00Z",
  ...opts,
});

export const createMockMetadataGenerationApplyResult = (
  opts?: Partial<MetadataGenerationApplyResult>,
): MetadataGenerationApplyResult => ({
  written: 0,
  stale: 0,
  failed: 0,
  failures: [],
  ...opts,
});
