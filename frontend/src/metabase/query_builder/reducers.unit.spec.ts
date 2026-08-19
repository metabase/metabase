import {
  QUERY_COMPLETED,
  QUERY_ERRORED,
  RESET_QB,
} from "metabase/redux/query-builder";
import { createMockCard } from "metabase-types/api/mocks";

import { lastRunCard } from "./reducers";

describe("lastRunCard reducer", () => {
  it("starts as null", () => {
    const state = lastRunCard(undefined, { type: "__INIT__" });
    expect(state).toBeNull();
  });

  it("stores lastRunCard on QUERY_COMPLETED when lastRunCard is provided", () => {
    const card = createMockCard({ id: 1, name: "Original" });
    const vizCard = createMockCard({ id: 2, name: "Override" });

    const state = lastRunCard(null, {
      type: QUERY_COMPLETED,
      payload: { card: vizCard, lastRunCard: card, queryResults: [] },
    });

    expect(state).toEqual(card);
    expect(state?.id).toBe(1);
    expect(state?.name).toBe("Original");
  });

  it("falls back to card when lastRunCard is not provided (backward compatibility)", () => {
    const card = createMockCard({ id: 3, name: "Legacy" });

    const state = lastRunCard(null, {
      type: QUERY_COMPLETED,
      payload: { card, queryResults: [] },
    });

    expect(state).toEqual(card);
    expect(state?.id).toBe(3);
  });

  it("resets to null on RESET_QB", () => {
    const card = createMockCard({ id: 5 });

    const state = lastRunCard(card, { type: RESET_QB });

    expect(state).toBeNull();
  });

  it("resets to null on QUERY_ERRORED", () => {
    const card = createMockCard({ id: 5 });

    const state = lastRunCard(card, {
      type: QUERY_ERRORED,
      payload: null,
    });

    expect(state).toBeNull();
  });
});
