import { OPEN_QUESTION_INFO } from "./actions";
import { queryBuilderReducer } from "./reducer";

describe("queryBuilderReducer uiControls", () => {
  it("should close the native variables sidebar when opening the question info sidebar (metabase#51717)", () => {
    const initialState = queryBuilderReducer(undefined, { type: "@@INIT" });
    const stateWithVariablesSidebarOpen = {
      ...initialState,
      uiControls: {
        ...initialState.uiControls,
        isShowingTemplateTagsEditor: true,
      },
    };

    const nextState = queryBuilderReducer(stateWithVariablesSidebarOpen, {
      type: OPEN_QUESTION_INFO,
    });

    expect(nextState.uiControls.isShowingQuestionInfoSidebar).toBe(true);
    expect(nextState.uiControls.isShowingTemplateTagsEditor).toBe(false);
  });
});
