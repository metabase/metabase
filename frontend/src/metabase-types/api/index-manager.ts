import type { TableId } from "./table";
import type { TransformId } from "./transform";
import type { UserId } from "./user";

export type IndexRequestId = number;

export type IndexRequestStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "dropped";

export type IndexAccessMethod =
  | "btree"
  | "hash"
  | "gin"
  | "gist"
  | "brin"
  | "spgist";

export type IndexColumnDirection = "asc" | "desc";

export type IndexColumnNulls = "first" | "last";

export interface IndexStructuredColumn {
  name: string;
  direction?: IndexColumnDirection;
  nulls?: IndexColumnNulls;
}

export interface IndexStructured {
  index_name: string;
  columns: IndexStructuredColumn[];
  include?: string[];
  unique?: boolean;
  concurrent?: boolean;
  if_not_exists?: boolean;
  method?: IndexAccessMethod;
}

export interface IndexRequest {
  id: IndexRequestId;
  status: IndexRequestStatus;
  error_message: string | null;
  created_by_id: UserId;
  created_at: string;
  last_executed_at: string | null;
}

export interface IndexRequestDetails extends IndexRequest {
  index_name: string;
  statement: string;
}

export interface IndexInfo {
  name: string;
  definition: string;
  access_method: string;
  is_unique: boolean;
  is_primary: boolean;
  is_valid: boolean;
  key_columns: string[];
  include_columns: string[];
  partial_predicate: string | null;
  managed_by_metabase: boolean;
  request: IndexRequest | null;
}

export interface IndexesTableSummary {
  id: TableId;
  schema: string;
  name: string;
  transform_id: TransformId | null;
  driver: string;
  driver_supported: boolean;
  can_manage: boolean;
}

export interface ListTableIndexesResponse {
  table: IndexesTableSummary;
  indexes: IndexInfo[];
}

export interface PreviewIndexRequest {
  tableId: TableId;
  structured: IndexStructured;
}

export interface PreviewIndexResponse {
  statement: string;
  warnings: string[];
}

export type CreateIndexRequest =
  | { tableId: TableId; statement: string }
  | { tableId: TableId; structured: IndexStructured };

export interface CreateIndexResponse {
  request_id: IndexRequestId;
  status: IndexRequestStatus;
}

export type UpdateIndexRequest =
  | { tableId: TableId; requestId: IndexRequestId; statement: string }
  | {
      tableId: TableId;
      requestId: IndexRequestId;
      structured: IndexStructured;
    };

export interface DeleteIndexRequest {
  tableId: TableId;
  requestId: IndexRequestId;
}

export interface DeleteIndexResponse {
  status: "dropping";
}

export interface GetIndexRequestArgs {
  tableId: TableId;
  requestId: IndexRequestId;
}
