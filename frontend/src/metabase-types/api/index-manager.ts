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

export type IndexFieldType =
  | "string"
  | "boolean"
  | "select"
  | "integer"
  | "columns";

export type IndexFieldOption = {
  // localized label
  name: string;
  // enum value written into the structured request body
  value: string;
};

// One form field describing how to request an index. Mirrors the backend
// `metabase.driver/::index-field` descriptor (same shape as a connection
// property), so the FE renders it like a database connection field. Each
// `name` (and each select option `value`) matches a key/enum in the kind's
// structured request branch.
export type IndexField = {
  name: string;
  "display-name": string;
  type: IndexFieldType;
  required?: boolean;
  // `columns` only: whether per-column asc/desc is offered
  directions?: boolean;
  // `select` only
  options?: IndexFieldOption[];
};

export type IndexMethodLifecycle = "standalone" | "inline";

// Metadata for one index kind a driver supports.
export type IndexMethod = {
  lifecycle: IndexMethodLifecycle;
  fields: IndexField[];
};

// index-kind -> metadata; mirrors backend `driver/supported-index-methods`.
export type RequestableIndexes = Record<string, IndexMethod>;

export const TABLE_INDEX_REQUEST_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dropped",
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

// A single field value collected by the config-driven index form.
export type IndexFieldValue = string | number | boolean | IndexColumn[];

// Structured index request body assembled from the driver's field descriptors.
// The exact key set is dictated by `requestable_indexes`, so we model it
// structurally rather than as the precise `StructuredIndex` union (used for
// reading existing requests).
export type StructuredIndexRequest = Record<string, IndexFieldValue> & {
  kind: string;
};

export type CreateTableIndexRequest = {
  transform_id: TransformId;
  structured: StructuredIndexRequest;
};

export type UpdateTableIndexRequest = {
  id: TableIndexRequestId;
  structured: StructuredIndexRequest;
};
