import { Field } from "metabase-types/api";

export const createMockField = (opts?: Partial<Field>): Field => ({
  id: 1,
  display_name: "Mock Field",
  table_id: 1,
  name: "mock_field",
  base_type: "type/Text",
  description: null,
  nfc_path: null,
  ...opts,
});
