import type { DatasetQuery } from "./query";
import type { Table } from "./table";

export type TransformId = number;

export type Transform = {
  id: TransformId;
  name: string;
  description: string | null;
  source: TransformSource;
  target: TransformTarget;
  table?: Table | null;
  execution_trigger: TransformExecutionTrigger;
};

export type TransformSource = {
  type: "query";
  query: DatasetQuery;
};

export type TransformTargetType = "view" | "table";

export type TransformTarget = {
  type: TransformTargetType;
  name: string;
  schema: string | null;
};

export type TransformExecutionTrigger = "none" | "global-schedule";

export type CreateTransformRequest = {
  name: string;
  source: TransformSource;
  target: TransformTarget;
  execution_trigger: TransformExecutionTrigger;
};

export type UpdateTransformRequest = {
  id: TransformId;
  name?: string;
  description?: string | null;
  source?: TransformSource;
  target?: TransformTarget;
  execution_trigger?: TransformExecutionTrigger;
};
