import type { MetabotState, MetabotUiControls } from "metabase-types/store";

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
  uiControls: createMockMetabotUiControls(),
  ...opts,
});

export const createMockMetabotUiControls = (
  opts?: Partial<MetabotUiControls>,
): MetabotUiControls => ({
  isShowingRawTable: false,
  ...opts,
});
