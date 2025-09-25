import type { DatabaseId } from "./database";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { DatasetQuery } from "./query";
import type { ScheduleDisplayType } from "./settings";
import type { ConcreteTableId, Table } from "./table";

export type TransformId = number;
export type TransformTagId = number;
export type TransformJobId = number;
export type TransformRunId = number;

export type Transform = {
  id: TransformId;
  name: string;
  description: string | null;
  source: TransformSource;
  target: TransformTarget;
  created_at: string;
  updated_at: string;

  // hydrated fields
  tag_ids?: TransformTagId[];
  table?: Table | null;
  last_run?: TransformRun | null;
};

export type SuggestedTransform = Partial<Pick<Transform, "id">> &
  Pick<Transform, "name" | "description" | "source" | "target">;

export type PythonTransformTableAliases = Record<string, ConcreteTableId>;

export type PythonTransformSource = {
  type: "python";
  body: string;
  "source-database": DatabaseId;
  "source-tables": PythonTransformTableAliases;
};

export type QueryTransformSource = {
  type: "query";
  query: DatasetQuery;
};

export type TransformSource = QueryTransformSource | PythonTransformSource;

export type TransformTargetType = "table";

export type TransformTarget = {
  type: TransformTargetType;
  name: string;
  schema: string | null;
  database: number;
};

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
};

export type UpdateTransformRequest = {
  id: TransformId;
  name?: string;
  description?: string | null;
  source?: TransformSource;
  target?: TransformTarget;
  tag_ids?: TransformTagId[];
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

export type ListTransformJobsRequest = {
  last_run_start_time?: string;
  next_run_start_time?: string;
  transform_tag_ids?: TransformTagId[];
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

export type ExecutePythonTransformRequest = {
  code: string;
  tables: PythonTransformTableAliases;
};

export type ExecutePythonTransformResponse = {
  output?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  exit_code?: number;
  timeout?: boolean;
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
