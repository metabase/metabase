import type { DatabaseId } from "./database";
import type { DatasetQuery } from "./query";

export type TransformId = number;

export type Transform = {
  id: TransformId;
  name: string;
  source: TransformSource;
  target: TransformTarget;
};

export type TransformSource = {
  type: "query";
  query: DatasetQuery;
};

export type TransformTarget = {
  type: "table";
  database: DatabaseId;
  schema: string;
  table: string;
};

export type CreateTransformRequest = {
  name: string;
  source: TransformSource;
  target: TransformTarget;
};
