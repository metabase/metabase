import type { DatasetQuery } from "./query";
import type { Table } from "./table";

export type TransformId = number;

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

export type CreateTransformRequest = {
  name: string;
  description: string | null;
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
