import type {
  MetadataGenerationApplyResult,
  MetadataGenerationEstimate,
  MetadataGenerationProposal,
  MetadataGenerationProposalTable,
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
  done_table_ids: null,
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

export const createMockMetadataGenerationProposalTable = (
  opts?: Partial<MetadataGenerationProposalTable>,
): MetadataGenerationProposalTable => ({
  table_id: 1,
  table_name: "ORDERS",
  schema: "PUBLIC",
  pending: 0,
  human_set_pending: 0,
  ...opts,
});

export const createMockMetadataGenerationProposal = (
  opts?: Partial<MetadataGenerationProposal>,
): MetadataGenerationProposal => ({
  id: 1,
  last_run_id: 1,
  table_id: 1,
  field_id: 1,
  field_name: "EMAIL",
  field_display_name: "Email",
  field_base_type: "type/Text",
  field_effective_type: "type/Text",
  attribute: "data_sensitivity",
  source: "none",
  current_value: null,
  proposed_value: "PII",
  confidence: "high",
  reasoning: null,
  created_at: "2026-10-09T00:00:00Z",
  updated_at: "2026-10-09T00:00:00Z",
  ...opts,
});

export const createMockMetadataGenerationApplyResult = (
  opts?: Partial<MetadataGenerationApplyResult>,
): MetadataGenerationApplyResult => ({
  written: 0,
  rejected: 0,
  failed: 0,
  failures: [],
  ...opts,
});
