import { Field } from "metabase-types/api";

export const createMockField = (opts?: Partial<Field>): Field => ({
  id: 1,

  name: "mock_field",
  display_name: "Mock Field",
  description: null,

  table_id: 1,

  base_type: "type/Text",
  semantic_type: "type/Text",

  active: true,
  visibility_type: "normal",
  preview_display: true,
  position: 1,
  nfc_path: null,

  last_analyzed: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...opts,
});
