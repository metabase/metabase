import type { Card, CardType } from "./card";
import type { Database, DatabaseId, InitialSyncStatus } from "./database";
import type { DatasetData } from "./dataset";
import type { Field, FieldId } from "./field";
import type { Segment } from "./segment";
import type { TransformId } from "./transform";
import type { UserId } from "./user";

export type ConcreteTableId = number;
export type VirtualTableId = string; // e.g. "card__17" where 17 is a card id
export type TableId = ConcreteTableId | VirtualTableId;
export type SchemaId = string; // ideally this should be typed as `${DatabaseId}:${SchemaName}`

export type TableVisibilityType =
  | null
  | "details-only"
  | "hidden"
  | "normal"
  | "retired"
  | "sensitive"
  | "technical"
  | "cruft";

export type TableVisibilityType2 = "gold" | "silver" | "bronze" | "copper";

export type TableDataSource =
  | "ingested"
  | "transform"
  | "metabase-transform"
  | "source-data"
  | "uploaded-data";

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
  visibility_type2: TableVisibilityType2 | null;
  owner_email: string | null;
  owner_user_id: UserId | null;
  transform_id: TransformId | null; // readonly
  data_update_frequency: string; // readonly
};

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
  term?: string;
  visibility_type?: TableVisibilityType;
  visibility_type2?: TableVisibilityType2;
  data_source?: string | null;
  owner_user_id?: UserId | null;
  owner_email?: string | null;
  orphan_only?: boolean | null;
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
  description?: string;
  caveats?: string;
  points_of_interest?: string;
  show_in_getting_started?: boolean;
  field_order?: TableFieldOrder;

  data_source?: TableDataSource | null;
  visibility_type2?: TableVisibilityType2 | null;
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
  visibility_type2?: TableVisibilityType2 | null;
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
  visibility_type2?: TableVisibilityType2 | null;
  owner_email?: string | null;
  owner_user_id?: UserId | null;
}

export type UploadManagementResponse = Table[];

export interface DeleteUploadTableRequest {
  tableId: TableId;
  "archive-cards"?: boolean;
}

export interface GetTableDataRequest {
  tableId: TableId;
}

export interface PublishModelsRequest {
  database_ids?: DatabaseId[];
  schema_ids?: SchemaId[];
  table_ids?: TableId[];
  target_collection_id: number | "library";
}

export interface PublishModelsResponse {
  created_count: number;
  models: Card[];
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
