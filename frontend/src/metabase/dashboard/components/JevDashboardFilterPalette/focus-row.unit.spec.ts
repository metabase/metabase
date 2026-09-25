import type { DashboardFocus, DashboardFocusCard } from "metabase/api/jev";

import {
  FOCUS_PARAMETER_TYPE,
  FOCUS_ROW_ID,
  combineSuggestions,
  getFocusRowSpec,
  getFocusSuggestion,
} from "./focus-row";

function createCard(
  id: number,
  title: string,
  score: number,
  focused: boolean,
): DashboardFocusCard {
  return {
    dashcard_id: id,
    card_id: id * 10,
    tab_id: null,
    title,
    pos: { row: 0, col: 0, size_x: 6, size_y: 4 },
    score,
    focused,
  };
}

function createFocus(opts: Partial<DashboardFocus> = {}): DashboardFocus {
  return {
    dashboard_id: 1,
    intent: "top vendors",
    available: true,
    cards: [
      createCard(1, "Revenue by vendor", 2.4, true),
      createCard(2, "Orders by vendor", 2.1, true),
      createCard(3, "Top products", 1.8, true),
      createCard(4, "Signups", 0.3, false),
    ],
    filters: [],
    ...opts,
  };
}

describe("getFocusSuggestion", () => {
  it("offers focusing on the top cards, with the best card's relevance as confidence", () => {
    const suggestion = getFocusSuggestion(createFocus());

    expect(suggestion).toMatchObject({
      parameter_id: FOCUS_ROW_ID,
      parameter_type: FOCUS_PARAMETER_TYPE,
      value: "top vendors",
      label: "Revenue by vendor, Orders by vendor +1 more",
    });
    expect(suggestion?.confidence).toBeCloseTo(0.8);
    expect(suggestion?.alternatives).toHaveLength(1);
  });

  it.each([
    ["no result", null],
    ["Jev unavailable", createFocus({ available: false })],
    ["no focused cards", createFocus({ cards: [] })],
  ])("offers nothing when there is %s", (_, focus) => {
    expect(getFocusSuggestion(focus)).toBeNull();
  });
});

describe("getFocusRowSpec", () => {
  it("shows the active focus as the row's current value", () => {
    expect(getFocusRowSpec(null).currentValue).toBe("Off");
    expect(getFocusRowSpec(createFocus()).currentValue).toBe(
      "On “top vendors”",
    );
  });
});

describe("combineSuggestions", () => {
  const focus = getFocusSuggestion(createFocus());

  it("puts the focus first and reports end-to-end latency", () => {
    const combined = combineSuggestions({
      filters: {
        status: "ok",
        filters: [],
        candidate_count: 2,
        elapsed_ms: 200,
        jev_ms: 150,
      },
      focus,
      elapsedMs: 312.4,
    });

    expect(combined.filters.map((filter) => filter.parameter_id)).toEqual([
      FOCUS_ROW_ID,
    ]);
    expect(combined).toMatchObject({ status: "ok", elapsed_ms: 312 });
    expect(combined.jev_ms).toBeUndefined();
  });

  it("is available when only the focus answered", () => {
    expect(
      combineSuggestions({ filters: null, focus, elapsedMs: 10 }).status,
    ).toBe("ok");
  });

  it("is unavailable when neither answered", () => {
    expect(
      combineSuggestions({ filters: null, focus: null, elapsedMs: 10 }),
    ).toMatchObject({ status: "unavailable", filters: [] });
  });
});
