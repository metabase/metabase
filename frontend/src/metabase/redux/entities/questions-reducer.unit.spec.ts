import {
  INJECT_RTK_QUERY_QUESTION_VALUE,
  questionsReducer,
} from "./questions-reducer";

describe("questionsReducer", () => {
  describe(INJECT_RTK_QUERY_QUESTION_VALUE, () => {
    it("merges the payload into the existing question", () => {
      const state = { 1: { id: 1, name: "Old", display: "table" } };

      const nextState = questionsReducer(state, {
        type: INJECT_RTK_QUERY_QUESTION_VALUE,
        payload: { id: 1, name: "New" },
      });

      expect(nextState[1]).toEqual({ id: 1, name: "New", display: "table" });
    });
  });

  it("ignores unrelated actions", () => {
    const state = { 1: { id: 1 } };

    expect(questionsReducer(state, { type: "metabase/unrelated" })).toBe(state);
  });
});
