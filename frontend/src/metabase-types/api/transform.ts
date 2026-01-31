import type { DatabaseId } from "./database";
import type { RowValue } from "./dataset";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { DatasetQuery, JoinStrategy } from "./query";
import type { ScheduleDisplayType } from "./settings";
import type { ConcreteTableId, Table } from "./table";
import type { UserId, UserInfo } from "./user";
import type { CardDisplayType } from "./visualization";

export type TransformId = number;
export type TransformTagId = number;
export type TransformJobId = number;
export type TransformRunId = number;

export type TransformOwner = Pick<
  UserInfo,
  "id" | "email" | "first_name" | "last_name"
>;

export type Transform = {
  id: TransformId;
  name: string;
  description: string | null;
  source: TransformSource;
  target: TransformTarget;
  collection_id: number | null;
  created_at: string;
  updated_at: string;
  source_readable: boolean;

  // true when transform was deleted but still referenced by runs
  deleted?: boolean;

  // creator fields
  creator_id?: UserId;

  // owner fields (can be different from creator)
  owner_user_id?: UserId | null;
  owner_email?: string | null;
  owner?: TransformOwner | null;

  // hydrated fields
  tag_ids?: TransformTagId[];
  table?: Table | null;
  last_run?: TransformRun | null;
  creator?: UserInfo;
};

export type SuggestedTransform = Partial<Pick<Transform, "id">> &
  Pick<Transform, "name" | "description" | "source" | "target">;

export type PythonTransformTableAliases = Record<string, ConcreteTableId>;

export type TransformSourceCheckpointStrategy = {
  type: "checkpoint";
  // For native queries
  "checkpoint-filter"?: string;
  // For MBQL and Python queries
  "checkpoint-filter-unique-key"?: string;
};

export type SourceIncrementalStrategy = TransformSourceCheckpointStrategy;

export type PythonTransformSourceDraft = {
  type: "python";
  body: string;
  "source-database": DatabaseId | undefined;
  "source-tables": PythonTransformTableAliases;
};

export type PythonTransformSource = {
  type: "python";
  body: string;
  "source-database": DatabaseId;
  "source-tables": PythonTransformTableAliases;
  "source-incremental-strategy"?: SourceIncrementalStrategy;
};

export type QueryTransformSource = {
  type: "query";
  query: DatasetQuery;
  "source-incremental-strategy"?: SourceIncrementalStrategy;
};

export type TransformSource = QueryTransformSource | PythonTransformSource;

export type TransformTargetAppendStrategy = {
  type: "append";
};
export type DraftTransformSource =
  | Transform["source"]
  | PythonTransformSourceDraft;

export type DraftTransform = Partial<
  Pick<Transform, "id" | "name" | "description" | "target">
> & { source: DraftTransformSource };

export type TargetIncrementalStrategy = TransformTargetAppendStrategy;

export type TransformTargetType = "table" | "table-incremental";

export type TableTarget = {
  type: "table";
  name: string;
  schema: string | null;
  database: number;
};

export type TableIncrementalTarget = {
  type: "table-incremental";
  name: string;
  schema: string | null;
  database: number;
  "target-incremental-strategy": TargetIncrementalStrategy;
};

export type TransformTarget = TableTarget | TableIncrementalTarget;

export type TransformRun = {
  id: TransformRunId;
  status: TransformRunStatus;
  start_time: string;
  end_time: string | null;
  message: string | null;
  run_method: TransformRunMethod;

  // hydrated fields
  transform?: Transform;
};

export type TransformRunStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "timeout"
  | "canceling"
  | "canceled";

export type TransformRunMethod = "manual" | "cron";

export type TransformTag = {
  id: TransformTagId;
  name: string;
  created_at: string;
  updated_at: string;
  can_run: boolean;
};

export type TransformJob = {
  id: TransformJobId;
  name: string;
  description: string | null;
  schedule: string;
  ui_display_type: ScheduleDisplayType;
  created_at: string;
  updated_at: string;

  // hydrated fields
  tag_ids?: TransformTagId[];
  last_run?: TransformRun | null;
  next_run?: { start_time: string } | null;
};

export type CreateTransformRequest = {
  name: string;
  description?: string | null;
  source: TransformSource;
  target: TransformTarget;
  tag_ids?: TransformTagId[];
  collection_id?: number | null;
  owner_user_id?: UserId | null;
  owner_email?: string | null;
};

export type UpdateTransformRequest = {
  id: TransformId;
  name?: string;
  description?: string | null;
  source?: TransformSource;
  target?: TransformTarget;
  tag_ids?: TransformTagId[];
  collection_id?: number | null;
  owner_user_id?: UserId | null;
  owner_email?: string | null;
};

export type CreateTransformJobRequest = {
  name: string;
  description?: string | null;
  schedule: string;
  ui_display_type?: ScheduleDisplayType;
  tag_ids?: TransformTagId[];
};

export type UpdateTransformJobRequest = {
  id: TransformJobId;
  name?: string;
  description?: string | null;
  schedule?: string;
  ui_display_type?: ScheduleDisplayType;
  tag_ids?: TransformTagId[];
};

export type CreateTransformTagRequest = {
  name: string;
};

export type UpdateTransformTagRequest = {
  id: TransformJobId;
  name?: string;
};

export type RunTransformResponse = {
  run_id: TransformRunId;
  message?: string;
};

export type ListTransformsRequest = {
  last_run_start_time?: string;
  last_run_statuses?: TransformRunStatus[];
  tag_ids?: TransformTagId[];
};

export type ListTransformJobsRequest = {
  last_run_start_time?: string;
  last_run_statuses?: TransformRunStatus[];
  next_run_start_time?: string;
  tag_ids?: TransformTagId[];
};

export type ListTransformRunsRequest = {
  statuses?: TransformRunStatus[];
  transform_ids?: TransformId[];
  transform_tag_ids?: TransformTagId[];
  start_time?: string;
  end_time?: string;
  run_methods?: TransformRunMethod[];
} & PaginationRequest;

export type ListTransformRunsResponse = {
  data: TransformRun[];
} & PaginationResponse;

export type TestPythonTransformRequest = {
  code: string;
  source_tables: PythonTransformTableAliases;
};

export type TestPythonTransformResponse = {
  logs?: string;
  error?: { message: string };
  output?: {
    cols: { name: string }[];
    rows: Record<string, RowValue>[];
  };
};

export type PythonLibrary = {
  path: string;
  source: string;
};

export type GetPythonLibraryRequest = {
  path: string;
};

export type UpdatePythonLibraryRequest = {
  path: string;
  source: string;
};

export type ExtractColumnsFromQueryRequest = {
  query: DatasetQuery;
};

export type ExtractColumnsFromQueryResponse = {
  columns: string[];
};

export type CheckQueryComplexityRequest = string;

export type QueryComplexity = {
  is_simple: boolean;
  reason: string;
};

export type TransformInspectFieldStats = {
  distinct_count?: number;
  nil_percent?: number;
  min?: number;
  max?: number;
  avg?: number;
};

export type TransformInspectField = {
  id?: number;
  name: string;
  display_name?: string;
  base_type?: string;
  semantic_type?: string;
  stats?: TransformInspectFieldStats;
};

export type TransformInspectSummaryTable = {
  table_name: string;
  row_count?: number;
  column_count: number;
};

export type TransformInspectSummary = {
  inputs: TransformInspectSummaryTable[];
  output: TransformInspectSummaryTable;
};

export type TransformInspectJoin = {
  strategy: JoinStrategy;
  alias?: string;
  source_table: ConcreteTableId;
  stats: {
    source_table?: unknown;
    left_row_count?: number;
    right_row_count?: number;
    matched_count?: number;
    match_rate?: number;
    left_match_rate?: number;
    right_match_rate?: number;
    output_row_count?: number;
    expansion_factor?: number;
    rhs_null_key_count?: number;
    rhs_null_key_percent?: number;
  };
};

export type TransformInspectSource = {
  table_id?: number;
  table_name: string;
  schema?: string;
  db_id?: number;
  row_count?: number;
  column_count: number;
  fields: TransformInspectField[];
};

export type TransformInspectTarget = {
  table_id: number;
  table_name: string;
  schema?: string;
  row_count?: number;
  column_count: number;
  fields: TransformInspectField[];
};

export type TransformInspectComparisonCard = {
  id: string;
  source: "input" | "output";
  table_name: string;
  field_name: string;
  title: string;
  display: CardDisplayType;
  dataset_query: DatasetQuery;
};

export type TransformInspectColumnComparison = {
  id: string;
  output_column: string;
  cards: TransformInspectComparisonCard[];
};

export type TransformInspectStatus = "not-run" | "ready";

export type TransformInspectVisitedFields = {
  join_fields?: number[];
  filter_fields?: number[];
  group_by_fields?: number[];
  all?: number[];
};

export type TransformInspectResponse = {
  name: string;
  description: string;
  status: TransformInspectStatus;
  summary?: TransformInspectSummary;
  joins?: TransformInspectJoin[];
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
  column_comparisons?: TransformInspectColumnComparison[];
  visited_fields?: TransformInspectVisitedFields;
};

// Inspector V2 Types

export type InspectorV2LensMetadata = {
  id: string;
  display_name: string;
  description?: string;
};

export type InspectorV2DiscoveryResponse = {
  name: string;
  description?: string;
  status: TransformInspectStatus;
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
  visited_fields?: TransformInspectVisitedFields;
  available_lenses: InspectorV2LensMetadata[];
};

export type InspectorV2LayoutType = "flat" | "comparison";

export type InspectorV2Section = {
  id: string;
  title: string;
  description?: string;
  layout?: InspectorV2LayoutType;
};

export type InspectorV2CardDisplayType =
  | "bar"
  | "row"
  | "line"
  | "area"
  | "pie"
  | "scalar"
  | "gauge"
  | "progress"
  | "table"
  | "hidden";

export type InspectorV2Card = {
  id: string;
  section_id?: string;
  title: string;
  display: InspectorV2CardDisplayType;
  dataset_query: DatasetQuery;
  interestingness?: number;
  summary?: boolean;
  visualization_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type InspectorV2SummaryHighlight = {
  label: string;
  value?: unknown;
  card_id?: string;
};

export type InspectorV2LensSummary = {
  text?: string;
  highlights?: InspectorV2SummaryHighlight[];
  alerts?: unknown[];
};

export type InspectorV2TriggerCondition = {
  card_id: string;
  field?: string | number | symbol;
  comparator: ">" | ">=" | "<" | "<=" | "=" | "!=";
  threshold: unknown;
};

export type InspectorV2AlertTrigger = {
  id: string;
  condition: InspectorV2TriggerCondition;
  severity: "info" | "warning" | "error";
  message: string;
};

export type InspectorV2DrillLensTrigger = {
  lens_id: string;
  condition: InspectorV2TriggerCondition;
  reason?: string;
};

export type InspectorV2Lens = {
  id: string;
  display_name: string;
  summary?: InspectorV2LensSummary;
  sections: InspectorV2Section[];
  cards: InspectorV2Card[];
  drill_lenses?: InspectorV2LensMetadata[];
  alert_triggers?: InspectorV2AlertTrigger[];
  drill_lens_triggers?: InspectorV2DrillLensTrigger[];
};

export type GetInspectorV2LensRequest = {
  transformId: TransformId;
  lensId: string;
};
