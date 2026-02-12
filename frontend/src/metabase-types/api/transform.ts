import type { Collection, CollectionId } from "./collection";
import type { DatabaseId } from "./database";
import type { RowValue } from "./dataset";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { DatasetQuery, JoinStrategy } from "./query";
import type { ScheduleDisplayType } from "./settings";
import type { SortDirection } from "./sorting";
import type { ConcreteTableId, SchemaName, Table } from "./table";
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
  source_type: "native" | "python" | "mbql";
  target: TransformTarget;
  collection_id: CollectionId | null;
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
  collection?: Collection | null;
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
  schema: SchemaName | null;
  database: DatabaseId;
};

export type TableIncrementalTarget = {
  type: "table-incremental";
  name: string;
  schema: SchemaName | null;
  database: DatabaseId;
  "target-incremental-strategy": TargetIncrementalStrategy;
};

export type TransformTarget = TableTarget | TableIncrementalTarget;

export type TransformRun = {
  id: TransformRunId;
  status: TransformRunStatus | null;
  start_time: string;
  end_time: string | null;
  message: string | null;
  run_method: TransformRunMethod;

  // hydrated fields
  transform?: Transform;
};

export const TRANSFORM_RUN_STATUSES = [
  "started",
  "succeeded",
  "failed",
  "timeout",
  "canceling",
  "canceled",
] as const;
export type TransformRunStatus = (typeof TRANSFORM_RUN_STATUSES)[number];

export const TRANSFORM_RUN_METHODS = ["manual", "cron"] as const;
export type TransformRunMethod = (typeof TRANSFORM_RUN_METHODS)[number];

export const TRANSFORM_RUN_SORT_COLUMNS = [
  "transform-name",
  "start-time",
  "end-time",
  "status",
  "run-method",
  "transform-tags",
] as const;
export type TransformRunSortColumn =
  (typeof TRANSFORM_RUN_SORT_COLUMNS)[number];

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
  source: DraftTransformSource;
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
  sort_column?: TransformRunSortColumn;
  sort_direction?: SortDirection;
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

type FieldStatsGeneric = "distinct_count" | "nil_percent";
type FieldStatsNumeric = "min" | "max" | "avg" | "q1" | "q3";
type FieldStatsTemporal = "earliest" | "latest";
export type FieldStats =
  | FieldStatsGeneric
  | FieldStatsNumeric
  | FieldStatsTemporal;

export type TransformInspectFieldStats = {
  distinct_count?: number;
  nil_percent?: number;
  // Numeric stats
  min?: number;
  max?: number;
  avg?: number;
  q1?: number;
  q3?: number;
  // Temporal stats
  earliest?: string;
  latest?: string;
};

export const TEMPORAL_BASE_TYPES = [
  "type/DateTime",
  "type/DateTimeWithLocalTZ",
  "type/DateTimeWithTZ",
  "type/DateTimeWithZoneID",
  "type/DateTimeWithZoneOffset",
  "type/Date",
  "type/Time",
  "type/TimeWithTZ",
] as const;

export const NUMERIC_BASE_TYPES = [
  "type/Integer",
  "type/BigInteger",
  "type/Float",
  "type/Decimal",
  "type/Number",
] as const;

export type TransformInspectField = {
  id?: number;
  name: string;
  display_name?: string;
  base_type?:
    | (typeof TEMPORAL_BASE_TYPES)[number]
    | (typeof NUMERIC_BASE_TYPES)[number];
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

export type InspectorLensComplexityLevel = "fast" | "slow" | "very-slow";

export type InspectorLensComplexity = {
  level: InspectorLensComplexityLevel;
  score?: number;
};

export type InspectorLensMetadata = {
  id: string;
  display_name: string;
  description?: string;
  complexity?: InspectorLensComplexity;
};

export type InspectorDiscoveryResponse = {
  name: string;
  description?: string;
  status: TransformInspectStatus;
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
  visited_fields?: TransformInspectVisitedFields;
  available_lenses: InspectorLensMetadata[];
};

export type InspectorLayoutType = "flat" | "comparison";

export type InspectorSection = {
  id: string;
  title: string;
  description?: string;
  layout?: InspectorLayoutType;
};

export type InspectorCardDisplayType = CardDisplayType | "hidden";

export type InspectorCard = {
  id: string;
  section_id?: string;
  title: string;
  display: InspectorCardDisplayType;
  dataset_query: DatasetQuery;
  interestingness?: number;
  summary?: boolean;
  visualization_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type InspectorSummaryHighlight = {
  label: string;
  value?: unknown;
  card_id?: string;
};

export type InspectorLensSummary = {
  text?: string;
  highlights?: InspectorSummaryHighlight[];
  alerts?: unknown[];
};

export type InspectorTriggerCondition = {
  name: string;
  [key: string]: unknown;
};

export type InspectorAlertTrigger = {
  id: string;
  condition: InspectorTriggerCondition;
  severity: "info" | "warning" | "error";
  message: string;
};

export type InspectorDrillLensTrigger = {
  lens_id: string;
  condition: InspectorTriggerCondition;
  params?: Record<string, unknown>;
  reason?: string;
};

export type InspectorLens = {
  id: string;
  display_name: string;
  summary?: InspectorLensSummary;
  sections: InspectorSection[];
  cards: InspectorCard[];
  drill_lenses?: InspectorLensMetadata[];
  alert_triggers?: InspectorAlertTrigger[];
  drill_lens_triggers?: InspectorDrillLensTrigger[];
};

export type GetInspectorLensRequest = {
  transformId: TransformId;
  lensId: string;
  lensParams?: unknown;
};

export type MetabotSuggestedTransform = SuggestedTransform & {
  active: boolean;
  suggestionId: string; // internal unique identifier for marking active/inactive
};
