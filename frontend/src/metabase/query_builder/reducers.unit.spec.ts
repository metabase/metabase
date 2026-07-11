import { onOpenQuestionInfo } from "metabase/redux/query-builder";

import { DEFAULT_UI_CONTROLS } from "./defaults";
import { uiControls } from "./reducers";

describe("query_builder uiControls reducer (metabase#51717)", () => {
  it("should close the native variables (template tags) sidebar when opening the question info sidebar", () => {
    const stateWithVariablesSidebarOpen = {
      ...DEFAULT_UI_CONTROLS,
      isShowingTemplateTagsEditor: true,
    };

    const nextState = uiControls(
      stateWithVariablesSidebarOpen,
      onOpenQuestionInfo(),
    );

    expect(nextState.isShowingQuestionInfoSidebar).toBe(true);
    // The bug (#51717): the variables sidebar stayed open on top of the info
    // sidebar, making the info sidebar non-interactive.
    expect(nextState.isShowingTemplateTagsEditor).toBe(false);
  });
});
