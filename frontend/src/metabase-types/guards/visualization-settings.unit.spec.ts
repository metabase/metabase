import type { GoalForeignColumnRef, GoalSegment } from "metabase-types/api";

import {
  isGoalForeignColumnRef,
  isGoalSegment,
  isGoalValue,
} from "./visualization-settings";

const FOREIGN_REF: GoalForeignColumnRef = {
  type: "card",
  id: 9,
  column: "total",
};

describe("isGoalForeignColumnRef", () => {
  it.each([FOREIGN_REF, { type: "measure", id: 4, column: "revenue" }])(
    "accepts %o",
    (value) => {
      expect(isGoalForeignColumnRef(value)).toBe(true);
    },
  );

  it.each([
    { type: "table", id: 9, column: "total" },
    { type: "card", id: "9", column: "total" },
    { type: "card", id: 9 },
    { type: "card", id: 9, column: 5 },
    null,
    "total",
    9,
  ])("rejects %o", (value) => {
    expect(isGoalForeignColumnRef(value)).toBe(false);
  });
});

describe("isGoalValue", () => {
  it.each([5, 0, -1.5, "total", FOREIGN_REF])("accepts %o", (value) => {
    expect(isGoalValue(value)).toBe(true);
  });

  it.each([null, undefined, {}, [1], true])("rejects %o", (value) => {
    expect(isGoalValue(value)).toBe(false);
  });
});

describe("isGoalSegment", () => {
  it.each<GoalSegment>([
    { min: 0, max: 100, color: "red" },
    { min: 0, max: 100, color: "red", label: "good" },
    { min: null, max: null, color: "red" },
    { min: "count", max: FOREIGN_REF, color: "red" },
    // the pre-2022 segments editor could persist segments without a color
    { min: 0, max: 100 },
    { min: 0, max: 100, color: null },
  ])("accepts %o", (segment) => {
    expect(isGoalSegment(segment)).toBe(true);
  });

  it.each([
    null,
    5,
    "segment",
    { min: 0, max: 100, color: 5 },
    { min: {}, max: 100, color: "red" },
    { min: 0, max: [1], color: "red" },
    { min: 0, max: { type: "card", id: 9 }, color: "red" },
  ])("rejects %o", (value) => {
    expect(isGoalSegment(value)).toBe(false);
  });
});
