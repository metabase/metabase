import type { DatasetQuery, TransformId } from "metabase-types/api";

export type TransformInfo = {
  id?: TransformId;
  name?: string;
  query: DatasetQuery;
  table?: string;
  schema?: string;
};
