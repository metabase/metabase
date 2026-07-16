import { createMockSetupState } from "metabase/redux/store/mocks";

import { selectStep } from "./actions";
import { reducer } from "./reducers";

describe("setup reducer", () => {
  it("should remember that the AI config step was visited", () => {
    const state = reducer(createMockSetupState(), selectStep("ai_config"));

    expect(state.step).toBe("ai_config");
    expect(state.hasVisitedAiConfigStep).toBe(true);
  });

  it("should not mark the AI config step as visited when selecting other steps", () => {
    const state = reducer(createMockSetupState(), selectStep("db_connection"));

    expect(state.step).toBe("db_connection");
    expect(state.hasVisitedAiConfigStep).toBe(false);
  });
});
