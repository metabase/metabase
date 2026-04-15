import type {
  SourceReplacementCheckInfo,
  SourceReplacementColumnInfo,
  SourceReplacementColumnMapping,
  SourceReplacementRun,
} from "metabase-types/api";

export const createMockReplaceSourceColumnInfo = (
  opts?: Partial<SourceReplacementColumnInfo>,
): SourceReplacementColumnInfo => ({
  id: 1,
  name: "mock_column",
  display_name: "Mock Column",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: null,
  ...opts,
});

export const createMockReplaceSourceColumnMapping = (
  opts?: Partial<SourceReplacementColumnMapping>,
): SourceReplacementColumnMapping => ({
  source: createMockReplaceSourceColumnInfo(),
  target: createMockReplaceSourceColumnInfo({
    id: 2,
    name: "target_column",
    display_name: "Target Column",
  }),
  ...opts,
});

export const createMockCheckReplaceSourceInfo = (
  opts?: Partial<SourceReplacementCheckInfo>,
): SourceReplacementCheckInfo => ({
  success: true,
  ...opts,
});

export const createMockReplaceSourceRun = (
  opts?: Partial<SourceReplacementRun>,
): SourceReplacementRun => ({
  id: 1,
  status: "started",
  is_active: true,
  source_entity_type: "card",
  source_entity_id: 1,
  target_entity_type: "card",
  target_entity_id: 2,
  progress: 0,
  message: null,
  user_id: null,
  start_time: new Date().toISOString(),
  end_time: null,
  ...opts,
});
