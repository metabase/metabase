import { createMockColumn, createMockField } from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

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
};

export function createOrdersDescriptionField() {
  return createMockField(FIELDS.description);
}

export function createOrdersDescriptionColumn() {
  return createMockColumn(FIELDS.description);
}

export function createOrdersCommentField() {
  return createMockField(FIELDS.comment);
}

export function createOrdersCommentColumn() {
  return createMockColumn(FIELDS.comment);
}

export function createOrdersStructuredField() {
  return createMockField(FIELDS.structured);
}

export function createOrdersStructuredColumn() {
  return createMockColumn(FIELDS.structured);
}

export function createOrdersSerializedJSONField() {
  return createMockField(FIELDS.serializedJSON);
}

export function createOrdersSerializedJSONColumn() {
  return createMockColumn(FIELDS.serializedJSON);
}

export function createAggregationColumn() {
  return createMockColumn({
    id: undefined,
    table_id: undefined,
    name: "count",
    display_name: "Count",
    source: "aggregation",
    aggregation_index: 0,
    field_ref: ["aggregation", 0],
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    semantic_type: "type/Quantity",
  });
}
