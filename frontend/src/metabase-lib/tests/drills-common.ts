import { createMockColumn, createMockField } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
  PEOPLE_ID,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import type { DatasetColumn } from "metabase-types/api";
import { createQuery } from "metabase-lib/test-helpers";

const FIELDS = {
  description: {
    id: 101,
    table_id: ORDERS_ID,
    name: "DESCRIPTION",
    display_name: "Description",
    base_type: "type/Text",
    semantic_type: "type/Description",
    effective_type: "type/Text",
  },
  comment: {
    id: 102,
    table_id: ORDERS_ID,
    name: "COMMENT",
    display_name: "Comment",
    base_type: "type/Text",
    semantic_type: "type/Comment",
    effective_type: "type/Text",
  },
  structured: {
    id: 103,
    table_id: ORDERS_ID,
    name: "STRUCTURED",
    display_name: "Structured",
    base_type: "type/Text",
    semantic_type: "type/Structured",
    effective_type: "type/Text",
  },
  serializedJSON: {
    id: 104,
    table_id: ORDERS_ID,
    name: "SERIALIZED_JSON",
    display_name: "SerializedJSON",
    base_type: "type/Text",
    semantic_type: "type/SerializedJSON",
    effective_type: "type/Text",
  },
  country: {
    id: 105,
    table_id: PEOPLE_ID,
    name: "COUNTRY",
    display_name: "Country",
    base_type: "type/Text",
    semantic_type: "type/Country",
    effective_type: "type/Text",
  },
};

export function createOrdersDescriptionField() {
  return createMockField(FIELDS.description);
}

export function createOrdersDescriptionDatasetColumn() {
  return createMockColumn(FIELDS.description);
}

export function createOrdersCommentField() {
  return createMockField(FIELDS.comment);
}

export function createOrdersCommentDatasetColumn() {
  return createMockColumn(FIELDS.comment);
}

export function createOrdersStructuredField() {
  return createMockField(FIELDS.structured);
}

export function createOrdersStructuredDatasetColumn() {
  return createMockColumn(FIELDS.structured);
}

export function createOrdersSerializedJSONField() {
  return createMockField(FIELDS.serializedJSON);
}

export function createOrdersSerializedJSONDatasetColumn() {
  return createMockColumn(FIELDS.serializedJSON);
}

export function createPeopleCountryField() {
  return createMockField(FIELDS.country);
}

export function createPeopleCountryDatasetColumn(
  opts?: Partial<DatasetColumn>,
) {
  return createMockColumn({ ...FIELDS.country, ...opts });
}

export function createCountDatasetColumn() {
  return createMockColumn({
    id: undefined,
    table_id: undefined,
    name: "count",
    display_name: "Count",
    source: "aggregation",
    field_ref: ["aggregation", 0],
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    semantic_type: "type/Quantity",
  });
}

export function createNotEditableQuery(query: Lib.Query) {
  const metadata = createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [],
      }),
    ],
  });
  return createQuery({
    metadata,
    query: Lib.toLegacyQuery(query),
  });
}
