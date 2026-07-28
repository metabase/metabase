import type {
  IndexField,
  IndexMethod,
  RequestableIndexes,
  TableIndexEntry,
  TableIndexRequest,
} from "metabase-types/api";

export const createMockTableIndexRequest = (
  opts?: Partial<TableIndexRequest>,
): TableIndexRequest => ({
  id: 1,
  transform_id: 1,
  index_name: "btree",
  structured: {
    kind: "btree",
    name: "btree",
    columns: [{ name: "id" }],
  },
  status: "create-pending",
  error_message: null,
  created_by: 1,
  created_at: "2020-01-01T00:00:00.000Z",
  updated_at: "2020-01-01T00:00:00.000Z",
  last_executed_at: null,
  ...opts,
});

export const createMockTableIndexEntry = (
  opts?: Partial<TableIndexEntry>,
): TableIndexEntry => ({
  metabase_managed: true,
  present_in_warehouse: true,
  name: "btree",
  kind: "btree",
  key_columns: ["id"],
  include_columns: [],
  is_unique: false,
  is_primary: false,
  is_valid: true,
  partial_predicate: null,
  access_method: null,
  request: createMockTableIndexRequest(),
  ...opts,
});

const INDEX_NAME_FIELD: IndexField = {
  name: "name",
  "display-name": "Give your index a name",
  type: "string",
  required: true,
};

export const createMockIndexMethod = (
  opts?: Partial<IndexMethod>,
): IndexMethod => ({
  lifecycle: "standalone",
  "display-name": "B-Tree",
  fields: [INDEX_NAME_FIELD],
  ...opts,
});

export const createMockRequestableIndexes = (): RequestableIndexes => ({
  btree: createMockIndexMethod({
    "display-name": "B-Tree",
    description:
      "Default. Best for equality and range queries on sortable data; use it for most columns you filter, sort, or join by.",
    fields: [
      INDEX_NAME_FIELD,
      {
        name: "unique",
        "display-name": "Unique",
        description: "Enforce uniqueness across rows for indexed columns.",
        type: "boolean",
      },
      {
        name: "columns",
        "display-name": "Columns",
        description:
          "The column(s) the index will be built on. Usually the ones you filter or join by.",
        type: "columns",
        required: true,
        directions: true,
      },
    ],
  }),
  gin: createMockIndexMethod({
    "display-name": "GIN",
    description:
      "For values with multiple components. Best for full-text search, JSONB, and arrays—when you're searching inside a value.",
    fields: [
      INDEX_NAME_FIELD,
      {
        name: "columns",
        "display-name": "Columns",
        description:
          "The column(s) the index will be built on. Usually the ones you filter or join by.",
        type: "columns",
        required: true,
      },
    ],
  }),
});
