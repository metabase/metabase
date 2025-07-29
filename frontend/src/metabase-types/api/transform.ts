import type { DatasetQuery } from "./query";
import type { Table } from "./table";

export type TransformId = number;

export type Transform = {
  id: TransformId;
  name: string;
  description: string | null;
  source: TransformSource;
  target: TransformTarget;
  schedule: string | null;
  table?: Table | null;
};

export type TransformSource = {
  type: "query";
  query: DatasetQuery;
};

export type TransformTargetType = "view" | "table";

export type TransformTarget = {
  type: TransformTargetType;
  name: string;
  schema: string;
};

export type CreateTransformRequest = {
  name: string;
  source: TransformSource;
  target: TransformTarget;
};

export type UpdateTransformRequest = {
  id: TransformId;
  name?: string;
  description?: string | null;
  source?: TransformSource;
  target?: TransformTarget;
  schedule?: string | null;
};
