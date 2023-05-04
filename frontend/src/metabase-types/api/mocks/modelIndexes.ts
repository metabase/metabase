import { ModelIndex } from "metabase-types/api";

export const createMockModelIndex = (
  opts?: Partial<ModelIndex>,
): ModelIndex => ({
  id: 1,
  model_id: 1,
  pk_ref: ["field", 1, null],
  value_ref: ["field", 2, null],
  state: "indexed",
  generation: 1,
  creator_id: 1,
  error: null,
  schedule: "0 0 22 * * ? *",
  state_changed_at: "2020-01-01T00:00:00.000Z",
  ...opts,
});
