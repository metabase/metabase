import type { DatabaseId } from "metabase-types/api/database";

import type { DatasetQuery } from "./query";

export type TransformId = number;

export type Transform = {
  id: TransformId;
  name: string;
  description: string | null;
  source: TransformSource;
  target: TransformTarget;
  schedule: string | null;
};

export type TransformSource = {
  type: "query";
  query: DatasetQuery;
};

export type TransformTarget = {
  type: "table";
  schema: string;
  table: string;
};

export type ListTransformsRequest = {
  database_id?: DatabaseId;
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
