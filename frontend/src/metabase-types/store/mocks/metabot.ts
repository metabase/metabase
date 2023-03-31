import { MetabotState } from "metabase-types/store";

export const createMockMetabotState = (
  opts?: Partial<MetabotState>,
): MetabotState => ({
  entityId: null,
  entityType: null,
  card: null,
  prompt: "",
  queryStatus: "idle",
  queryResults: null,
  queryError: null,
  feedbackType: null,
  promptTemplateVersions: null,
  cancelQueryDeferred: null,
  ...opts,
});
