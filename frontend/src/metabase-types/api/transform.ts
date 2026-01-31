import type { DatabaseId } from "./database";
import type { RowValue } from "./dataset";
import type {
  PaginationRequest,
  PaginationResponse,
  SortDirection,
} from "./pagination";
import type { DatasetQuery } from "./query";
import type { ScheduleDisplayType } from "./settings";
import type { ConcreteTableId, Table } from "./table";
import type { UserId, UserInfo } from "./user";

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
  "start-time",
  "end-time",
  "run-method",
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
