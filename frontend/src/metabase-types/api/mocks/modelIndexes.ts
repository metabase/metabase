import { ModelIndex } from "metabase-types/api";

export const createMockModelIndex = (
  opts?: Partial<ModelIndex>,
): ModelIndex => ({
  id: 1,
  model_id: 1,
  pk_ref: ["field", 1, null],
  value_ref: ["field", 2, null],
  state: "indexed",
  ...opts,
});
