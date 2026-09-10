import {
  FIXTURE_INPUTS,
  LENS_HINT,
  ONE_BY_ONE_COUNT,
  TIME_SERIES,
} from "../__fixtures__/inputs";
import { getContractViolations } from "../contract";

import { lensHintHeuristic } from "./index";

describe("lens-hint heuristic", () => {
  it("satisfies the contract", () => {
    expect(
      getContractViolations(lensHintHeuristic, Object.values(FIXTURE_INPUTS)),
    ).toEqual([]);
  });

  it("returns the hint verbatim", () => {
    expect(lensHintHeuristic.resolve(LENS_HINT)).toEqual({
      display: "row",
      settings: { "graph.x_axis.labels_enabled": false },
    });
  });

  it("keeps an explicit hint even for a 1×1 result", () => {
    expect(
      lensHintHeuristic.resolve({
        ...ONE_BY_ONE_COUNT,
        hint: { display: "gauge" },
      }).display,
    ).toBe("gauge");
  });

  it("falls back to a table (or scalar for 1×1) without a hint", () => {
    expect(lensHintHeuristic.resolve(TIME_SERIES)).toEqual({
      display: "table",
    });
    expect(lensHintHeuristic.resolve(ONE_BY_ONE_COUNT)).toEqual({
      display: "scalar",
    });
  });

  it("respects allowed", () => {
    expect(
      lensHintHeuristic.resolve({ ...LENS_HINT, allowed: ["bar", "line"] })
        .display,
    ).toBe("bar");
  });
});
