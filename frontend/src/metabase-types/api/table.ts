import type { Card, CardType } from "./card";
import type { Collection, CollectionId } from "./collection";
import type { Database, DatabaseId, InitialSyncStatus } from "./database";
import type { DatasetData } from "./dataset";
import type { Field, FieldId } from "./field";
import type { Measure } from "./measure";
import type { Segment } from "./segment";
import type { Transform, TransformId } from "./transform";
import type { UserId, UserInfo } from "./user";

export type ConcreteTableId = number;
export type VirtualTableId = string; // e.g. "card__17" where 17 is a card id
export type TableId = ConcreteTableId | VirtualTableId;
export type SchemaId = string; // ideally this should be typed as `${DatabaseId}:${SchemaName}`

export function isConcreteTableId(
  id: TableId | undefined,
): id is ConcreteTableId {
  return typeof id === "number";
}

export type TableVisibilityType =
  | null
  | "details-only"
  | "hidden"
  | "normal"
  | "retired"
  | "sensitive"
  | "technical"
  | "cruft";

export type TableDataLayer = "hidden" | "internal" | "published";

export type TableDataSource =
  | "ingested"
  | "transform"
  | "metabase-transform"
  | "source-data"
  | "upload";

export type TableFieldOrder = "database" | "alphabetical" | "custom" | "smart";

export type Table = {
  id: TableId;
  type?: CardType;
  name: string;
  display_name: string;
  description: string | null;
  entity_type?: string | null;

  db_id: DatabaseId;
  db?: Database;

  schema: SchemaName;

  fks?: ForeignKey[];
  fields?: Field[];
  segments?: Segment[];
  measures?: Measure[];
  metrics?: Card[];
  field_order: TableFieldOrder;

  active: boolean;
  visibility_type: TableVisibilityType;
  initial_sync_status: InitialSyncStatus;
  is_upload: boolean;
  is_writable?: boolean;
  caveats?: string;
  points_of_interest?: string;
  created_at: string;
  updated_at: string;

  data_source: TableDataSource | null;
  data_layer: TableDataLayer | null;
  owner_email: string | null;
  owner_user_id: UserId | null;
  owner?: TableOwner | null;
  estimated_row_count?: number | null;
  transform_id: TransformId | null; // readonly
  view_count: number;
  transform?: Transform;

  collection_id: CollectionId | null;
  is_published: boolean;
  collection?: Collection;
};

export type TableOwner = Pick<
  UserInfo,
  "id" | "email" | "first_name" | "last_name"
>;

export type SchemaName = string;

export interface Schema {
  id: SchemaId;
  name: SchemaName;
}

export interface SchemaListQuery {
  dbId: DatabaseId;
  include_hidden?: boolean;
  include_editable_data_model?: boolean;
}

export interface TableMetadataQuery {
  include_sensitive_fields?: boolean;
  include_hidden_fields?: boolean;
  include_editable_data_model?: boolean;
}

export interface TableListQuery {
  dbId?: DatabaseId;
  schemaName?: string;
  include_hidden?: boolean;
  include_editable_data_model?: boolean;
  remove_inactive?: boolean;
  skip_fields?: boolean;
  "can-query"?: boolean;

  term?: string;
  "data-layer"?: TableDataLayer;
  "data-source"?: string | null;
  "owner-user-id"?: UserId | null;
  "owner-email"?: string | null;
  "unused-only"?: boolean | null;
  "orphan-only"?: boolean;
}

export interface ForeignKey {
  origin?: Field;
  origin_id: FieldId;
  destination?: Field;
  destination_id: FieldId;
  relationship: "Mt1";
}

export interface GetTableRequest {
  id: TableId;
  include_editable_data_model?: boolean;
}

export interface GetTableQueryMetadataRequest {
  id: TableId;
  include_sensitive_fields?: boolean;
  include_hidden_fields?: boolean;
  include_editable_data_model?: boolean;
}

export interface UpdateTableRequest {
  id: TableId;
  display_name?: string;
  visibility_type?: TableVisibilityType;
  description?: string | null;
  caveats?: string;
  points_of_interest?: string;
  show_in_getting_started?: boolean;
  field_order?: TableFieldOrder;

  data_source?: TableDataSource | null;
  data_layer?: TableDataLayer | null;
  entity_type?: string | null;
  owner_email?: string | null;
  owner_user_id?: UserId | null;
}

export interface UpdateTableListRequest {
  ids: TableId[];
  display_name?: string;
  visibility_type?: TableVisibilityType;
  description?: string;
  caveats?: string;
  points_of_interest?: string;
  show_in_getting_started?: boolean;

  data_source?: TableDataSource | null;
  data_layer?: TableDataLayer | null;
  entity_type?: string | null;
  owner_email?: string | null;
  owner_user_id?: UserId | null;
}

export interface UpdateTableFieldsOrderRequest {
  id: TableId;
  field_order: FieldId[];
}

export interface EditTablesRequest {
  database_ids?: DatabaseId[];
  schema_ids?: SchemaId[];
  table_ids?: TableId[];
  visibility_type?: TableVisibilityType;
  data_authority?: string;
  data_source?: TableDataSource | null;
  data_layer?: TableDataLayer | null;
  owner_email?: string | null;
  owner_user_id?: UserId | null;
  entity_type?: string | null;
}

export interface SyncTablesSchemaRequest {
  database_ids?: DatabaseId[];
  schema_ids?: SchemaId[];
  table_ids?: TableId[];
}

export interface RescanTablesValuesRequest {
  database_ids?: DatabaseId[];
  schema_ids?: SchemaId[];
  table_ids?: TableId[];
}

export interface DiscardTablesValuesRequest {
  database_ids?: DatabaseId[];
  schema_ids?: SchemaId[];
  table_ids?: TableId[];
}

export type UploadManagementResponse = Table[];

export interface DeleteUploadTableRequest {
  tableId: TableId;
  "archive-cards"?: boolean;
}

export interface GetTableDataRequest {
  tableId: TableId;
}

export type TableData = {
  data: DatasetData;
  database_id: DatabaseId;
  table_id: TableId;
  row_count: number;
  running_time: number;
  error?:
    | string
    | {
        status: number; // HTTP status code
        data?: string;
      };
  error_type?: string;
  error_is_curated?: boolean;
  status?: string;
  /** In milliseconds */
  average_execution_time?: number;
  /** A date in ISO 8601 format */
  started_at?: string;
};

export interface BulkTableInfo {
  id: TableId;
  db_id: DatabaseId;
  name: string;
  display_name: string;
  schema: string | null;
  is_published: boolean;
}

export interface BulkTableSelection {
  database_ids?: DatabaseId[];
  schema_ids?: SchemaId[];
  table_ids?: TableId[];
}

export interface BulkTableSelectionInfo {
  // if only one table was selected, returns this table, otherwise null
  selected_table: BulkTableInfo | null;
  // tables outside the selection that use selected tables for remapping
  published_downstream_tables: BulkTableInfo[];
  // tables outside the selection that are used for remapping by selected tables
  unpublished_upstream_tables: BulkTableInfo[];
}

export interface PublishTablesResponse {
  target_collection: Collection | null;
}
