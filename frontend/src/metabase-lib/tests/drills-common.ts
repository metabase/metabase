import {
  createMockColumn,
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";
import { createMockMetadata } from "__support__/metadata";

const DATABASE_ID = 1;
const TABLE_ID = 1;

const FIELDS = {
  id: {
    id: 100,
    table_id: TABLE_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/Integer",
    semantic_type: "type/PK",
    effective_type: "type/Integer",
  },
  description: {
    id: 101,
    table_id: TABLE_ID,
    name: "DESCRIPTION",
    display_name: "Description",
    base_type: "type/Text",
    semantic_type: "type/Description",
    effective_type: "type/Text",
  },
  comment: {
    id: 102,
    table_id: TABLE_ID,
    name: "COMMENT",
    display_name: "Comment",
    base_type: "type/Text",
    semantic_type: "type/Comment",
    effective_type: "type/Text",
  },
  structured: {
    id: 103,
    table_id: TABLE_ID,
    name: "STRUCTURED",
    display_name: "Structured",
    base_type: "type/Text",
    semantic_type: "type/Structured",
    effective_type: "type/Text",
  },
  serializedJSON: {
    id: 104,
    table_id: TABLE_ID,
    name: "SERIALIZED_JSON",
    display_name: "SerializedJSON",
    base_type: "type/Text",
    semantic_type: "type/SerializedJSON",
    effective_type: "type/Text",
  },
};

export const TABLE = createMockTable({
  id: TABLE_ID,
  fields: [
    createMockField(FIELDS.id),
    createMockField(FIELDS.description),
    createMockField(FIELDS.comment),
    createMockField(FIELDS.structured),
    createMockField(FIELDS.serializedJSON),
  ],
});

export const DATABASE = createMockDatabase({
  id: DATABASE_ID,
  tables: [TABLE],
});

export const COLUMNS = {
  id: createMockColumn(FIELDS.id),
  description: createMockColumn(FIELDS.description),
  comment: createMockColumn(FIELDS.comment),
  structured: createMockColumn(FIELDS.structured),
  serializedJSON: createMockColumn(FIELDS.serializedJSON),
};

export const METADATA = createMockMetadata({
  databases: [DATABASE],
});
