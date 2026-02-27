import type {
  CheckReplaceSourceInfo,
  ReplaceSourceColumnInfo,
  ReplaceSourceColumnMapping,
  ReplaceSourceRun,
} from "metabase-types/api";

export const createMockReplaceSourceColumnInfo = (
  opts?: Partial<ReplaceSourceColumnInfo>,
): ReplaceSourceColumnInfo => ({
  id: 1,
  name: "mock_column",
  display_name: "Mock Column",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: null,
  ...opts,
});

export const createMockReplaceSourceColumnMapping = (
  opts?: Partial<ReplaceSourceColumnMapping>,
): ReplaceSourceColumnMapping => ({
  source: createMockReplaceSourceColumnInfo(),
  target: createMockReplaceSourceColumnInfo({
    id: 2,
    name: "target_column",
    display_name: "Target Column",
  }),
  ...opts,
});

export const createMockCheckReplaceSourceInfo = (
  opts?: Partial<CheckReplaceSourceInfo>,
): CheckReplaceSourceInfo => ({
  success: true,
  ...opts,
});

export const createMockReplaceSourceRun = (
  opts?: Partial<ReplaceSourceRun>,
): ReplaceSourceRun => ({
  id: 1,
  status: "started",
  progress: 0,
  start_time: new Date().toISOString(),
  ...opts,
});
