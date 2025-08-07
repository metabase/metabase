import type { DatasetQuery } from "./query";
import type { Table } from "./table";

export type TransformId = number;
export type TransformTagId = number;
export type TransformJobId = number;

export type Transform = {
  id: TransformId;
  name: string;
  description: string | null;
  source: TransformSource;
  target: TransformTarget;

  // hydrated fields
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
  status: TransformExecutionStatus;
  start_time: string;
  end_time: string | null;
};

export type TransformExecutionStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "timeout";

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
  last_execution?: TransformExecution | null;
};

export type CreateTransformRequest = {
  name: string;
  description?: string | null;
  source: TransformSource;
  target: TransformTarget;
};

export type UpdateTransformRequest = {
  id: TransformId;
  name?: string;
  description?: string | null;
  source?: TransformSource;
  target?: TransformTarget;
};

export type CreateTransformJobRequest = {
  name: string;
  description?: string | null;
  schedule: string;
};

export type UpdateTransformJobRequest = {
  id: TransformJobId;
  name?: string;
  description?: string | null;
  schedule?: string;
};

export type CreateTransformTagRequest = {
  name: string;
};

export type UpdateTransformTagRequest = {
  id: TransformJobId;
  name?: string;
};
