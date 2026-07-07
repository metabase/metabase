import type { TransformId } from "./transform";
import type { UserId } from "./user";

export type TableIndexRequestId = number;

export type IndexColumnDirection = "asc" | "desc";

export type IndexColumn = {
  name: string;
  direction?: IndexColumnDirection;
};

export const CLASSICAL_INDEX_KINDS = [
  "btree",
  "hash",
  "gin",
  "gist",
  "brin",
  "spgist",
  "fulltext",
  "spatial",
  "clustered",
  "nonclustered",
  "columnstore",
] as const;
export type ClassicalIndexKind = (typeof CLASSICAL_INDEX_KINDS)[number];

export type ClassicalIndex = {
  kind: ClassicalIndexKind;
  name: string;
  columns: IndexColumn[];
  include?: string[];
  unique?: boolean;
};

export type SortKeyStyle = "compound" | "interleaved";

export type SortKeyIndex = {
  kind: "sortkey";
  style: SortKeyStyle;
  columns: IndexColumn[];
};

export type DistKeyIndex = {
  kind: "distkey";
  column: string;
};

export type ClusteringIndex = {
  kind: "clustering";
  name?: string;
  columns: IndexColumn[];
};

export type OrderByIndex = {
  kind: "order-by";
  columns: IndexColumn[];
};

export const SKIP_INDEX_TYPES = [
  "minmax",
  "set",
  "bloom_filter",
  "ngrambf_v1",
  "tokenbf_v1",
] as const;
export type SkipIndexType = (typeof SKIP_INDEX_TYPES)[number];

export type SkipIndex = {
  kind: "skip-index";
  name: string;
  columns: IndexColumn[];
  type: SkipIndexType;
  "type-args"?: unknown[];
  granularity?: number;
};

export type StructuredIndex =
  | ClassicalIndex
  | SortKeyIndex
  | DistKeyIndex
  | ClusteringIndex
  | OrderByIndex
  | SkipIndex;

export type IndexKind = StructuredIndex["kind"];

export const TABLE_INDEX_REQUEST_STATUSES = [
  "create-pending",
  "update-pending",
  "delete-pending",
  "running",
  "succeeded",
  "failed",
] as const;
export type TableIndexRequestStatus =
  (typeof TABLE_INDEX_REQUEST_STATUSES)[number];

export type TableIndexRequest = {
  id: TableIndexRequestId;
  transform_id: TransformId;
  index_name: string;
  structured: StructuredIndex;
  status: TableIndexRequestStatus;
  error_message: string | null;
  created_by: UserId | null;
  created_at: string;
  updated_at: string;
  last_executed_at: string | null;
};

export type TableIndexEntry = {
  metabase_managed: boolean;
  present_in_warehouse: boolean;
  name: string | null;
  kind: string;
  key_columns: string[];
  include_columns: (string | null)[];
  is_unique: boolean;
  is_primary: boolean;
  is_valid: boolean;
  partial_predicate: string | null;
  access_method: string | null;
  request?: TableIndexRequest;
};

export type ListTableIndexesRequest = {
  "transform-id": TransformId;
};

export type ListTableIndexesResponse = {
  data: TableIndexEntry[];
};

export type CreateTableIndexRequest = {
  transform_id: TransformId;
  structured: StructuredIndex;
};

export type UpdateTableIndexRequest = {
  id: TableIndexRequestId;
  structured: StructuredIndex;
};

export type IndexFieldType =
  | "string"
  | "boolean"
  | "select"
  | "integer"
  | "columns";

export type IndexFieldOption = {
  name: string;
  value: string;
};

export type IndexField = {
  name: string;
  "display-name": string;
  description?: string;
  type: IndexFieldType;
  required?: boolean;
  directions?: boolean;
  options?: IndexFieldOption[];
};

export type IndexMethodLifecycle = "standalone" | "inline";

export type IndexMethod = {
  lifecycle: IndexMethodLifecycle;
  "display-name": string;
  description?: string;
  fields: IndexField[];
};

export type RequestableIndexes = Partial<Record<IndexKind, IndexMethod>>;
