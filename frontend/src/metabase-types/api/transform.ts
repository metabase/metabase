import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { DatasetQuery } from "./query";
import type { Table } from "./table";

export type TransformId = number;
export type TransformTagId = number;
export type TransformJobId = number;
export type TransformExecutionId = number;

export type Transform = {
  id: TransformId;
  name: string;
  description: string | null;
  source: TransformSource;
  target: TransformTarget;

  // hydrated fields
  tag_ids?: TransformTagId[];
  table?: Table | null;
  last_execution?: TransformExecution | null;
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

export type TransformExecution = {
  id: TransformExecutionId;
  status: TransformExecutionStatus;
  trigger: TransformExecutionTrigger;
  start_time: string;
  end_time: string | null;

  // hydrated
  transform?: Transform;
};

export type TransformExecutionStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "timeout";

export type TransformExecutionTrigger = "manual" | "schedule";

export type TransformTag = {
  id: TransformTagId;
  name: string;
};

export type TransformJob = {
  id: TransformJobId;
  name: string;
  description: string | null;
  schedule: string;

  // hydrated fields
  tag_ids?: TransformTagId[];
  last_execution?: TransformExecution | null;
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

export type ListTransformExecutionsRequest = {
  transform_ids?: TransformId[];
  statuses?: TransformExecutionStatus[];
} & PaginationRequest;

export type ListTransformExecutionsResponse = {
  data: TransformExecution[];
} & PaginationResponse;
