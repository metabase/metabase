import { SOFT_RELOAD_CARD } from "metabase/redux/query-builder";

import {
  INJECT_RTK_QUERY_QUESTION_VALUE,
  questionsReducer,
} from "./questions-reducer";

describe("questionsReducer", () => {
  describe(SOFT_RELOAD_CARD, () => {
    it("updates moderated_status from the most recent review", () => {
      const state = { 1: { id: 1, moderated_status: null } };

      const nextState = questionsReducer(state, {
        type: SOFT_RELOAD_CARD,
        payload: {
          id: 1,
          moderation_reviews: [
            { status: "verified", most_recent: true },
            { status: null, most_recent: false },
          ],
        },
      });

      expect(nextState[1].moderated_status).toBe("verified");
    });

    it("leaves state untouched when there is no most-recent review", () => {
      const state = { 1: { id: 1, moderated_status: "verified" } };

      const nextState = questionsReducer(state, {
        type: SOFT_RELOAD_CARD,
        payload: { id: 1, moderation_reviews: [] },
      });

      expect(nextState).toBe(state);
    });
  });

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
