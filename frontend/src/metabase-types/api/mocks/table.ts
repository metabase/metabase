import type {
  BulkTableInfo,
  BulkTableSelection,
  BulkTableSelectionInfo,
  ForeignKey,
  PublishTablesResponse,
  Schema,
  Table,
} from "metabase-types/api";

export const createMockTable = (opts?: Partial<Table>): Table => {
  return {
    id: 1,
    db_id: 1,
    display_name: "Table",
    name: "table",
    schema: "public",
    description: null,
    active: true,
    visibility_type: null,
    field_order: "database",
    initial_sync_status: "complete",
    segments: [],
    is_upload: false,
    created_at: "2021-05-01T00:00:00",
    updated_at: "2021-05-01T00:00:00",
    data_source: null,
    data_layer: null,
    owner_email: null,
    owner_user_id: null,
    transform_id: null,
    view_count: 0,
    collection_id: null,
    is_published: false,
    ...opts,
  };
};

export const createMockSchema = (opts?: Partial<Schema>): Schema => ({
  id: "1",
  name: "Schema 1",
  ...opts,
});

export const createMockForeignKey = (
  opts?: Partial<ForeignKey>,
): ForeignKey => ({
  origin_id: 1,
  destination_id: 1,
  relationship: "Mt1",
  ...opts,
});

export const createMockBulkTableInfo = (
  opts?: Partial<BulkTableInfo>,
): BulkTableInfo => {
  return {
    id: 1,
    db_id: 1,
    name: "TABLE",
    display_name: "Table",
    schema: "public",
    is_published: false,
    ...opts,
  };
};

export const createMockBulkTableSelection = (
  opts?: Partial<BulkTableSelection>,
): BulkTableSelection => {
  return {
    ...opts,
  };
};

export const createMockBulkTableSelectionInfo = (
  opts?: Partial<BulkTableSelectionInfo>,
): BulkTableSelectionInfo => {
  return {
    selected_table: null,
    published_downstream_tables: [],
    unpublished_upstream_tables: [],
    ...opts,
  };
};

export const createMockPublishTablesResponse = (
  opts?: Partial<PublishTablesResponse>,
): PublishTablesResponse => {
  return {
    target_collection: null,
    ...opts,
  };
};
