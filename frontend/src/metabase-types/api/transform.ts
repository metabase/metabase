import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { DatasetQuery } from "./query";
import type { Table } from "./table";

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

export type TransformSource = {
  type: "query";
  query: DatasetQuery;
};

export type TransformTargetType = "table";

export type TransformTarget = {
  type: TransformTargetType;
  name: string;
  schema: string | null;
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
  tag_ids?: TransformTagId[];
};

export type UpdateTransformJobRequest = {
  id: TransformJobId;
  name?: string;
  description?: string | null;
  schedule?: string;
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
