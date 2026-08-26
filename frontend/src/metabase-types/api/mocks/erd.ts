import type {
  ErdEdge,
  ErdField,
  ErdNode,
  ErdResponse,
} from "metabase-types/api";

export const createMockErdField = (opts?: Partial<ErdField>): ErdField => ({
  id: 1,
  name: "f",
  display_name: "f",
  database_type: "text",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: null,
  fk_target_field_id: null,
  fk_target_table_id: null,
  ...opts,
});

export const createMockErdNode = (opts?: Partial<ErdNode>): ErdNode => ({
  table_id: 1,
  name: "t1",
  display_name: "T1",
  description: null,
  owner: null,
  schema: "public",
  visibility_type: null,
  db_id: 1,
  fields: [],
  ...opts,
});

export const createMockErdEdge = (opts?: Partial<ErdEdge>): ErdEdge => ({
  source_table_id: 1,
  source_field_id: 10,
  target_table_id: 2,
  target_field_id: 20,
  relationship: "many-to-one",
  ...opts,
});

export const createMockErdResponse = (
  opts?: Partial<ErdResponse>,
): ErdResponse => ({
  nodes: [],
  edges: [],
  ...opts,
});
