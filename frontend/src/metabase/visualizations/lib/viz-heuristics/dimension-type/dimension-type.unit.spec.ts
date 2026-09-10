import { DEFAULT_DISPLAY_TYPE_BY_DIMENSION } from "metabase/common/metrics/utils/dimension-types";

import {
  CATEGORY_BAR,
  FIXTURE_INPUTS,
  GEO_STATE,
  LENS_HINT,
  NUMERIC,
  ONE_BY_ONE_COUNT,
  TIME_SERIES,
} from "../__fixtures__/inputs";
import { getContractViolations } from "../contract";
import type { DimensionType, VizInput } from "../types";

import { dimensionTypeHeuristic } from "./index";

const BY_TYPE: Array<[DimensionType, VizInput]> = [
  ["time", TIME_SERIES],
  ["geo", GEO_STATE],
  ["category", CATEGORY_BAR],
  ["boolean", { ...CATEGORY_BAR, dimensionType: "boolean" }],
  ["numeric", NUMERIC],
];

describe("dimension-type heuristic", () => {
  it("satisfies the contract", () => {
    expect(
      getContractViolations(
        dimensionTypeHeuristic,
        Object.values(FIXTURE_INPUTS),
      ),
    ).toEqual([]);
  });

  it.each(BY_TYPE)(
    "%s resolves to the metric overview default display",
    (type, input) => {
      const { display } = dimensionTypeHeuristic.resolve(input);
      expect(display).toBe(DEFAULT_DISPLAY_TYPE_BY_DIMENSION[type]);
    },
  );

  it("resolves scalar to scalar", () => {
    expect(dimensionTypeHeuristic.resolve(ONE_BY_ONE_COUNT)).toEqual({
      display: "scalar",
    });
    expect(
      dimensionTypeHeuristic.resolve({
        ...TIME_SERIES,
        dimensionType: "scalar",
      }).display,
    ).toBe("scalar");
  });

  it("uses the hint when the dimension type is absent", () => {
    expect(dimensionTypeHeuristic.resolve(LENS_HINT)).toEqual({
      display: "row",
      settings: { "graph.x_axis.labels_enabled": false },
    });
  });

  it("falls back to the legacy default without a hint or dimension type", () => {
    expect(
      dimensionTypeHeuristic.resolve({
        ...TIME_SERIES,
        dimensionType: undefined,
      }),
    ).toEqual({ display: "table" });
  });

  it("ignores the hint when the dimension type is known", () => {
    expect(
      dimensionTypeHeuristic.resolve({
        ...TIME_SERIES,
        hint: { display: "bar" },
      }).display,
    ).toBe("line");
  });

  it("respects allowed", () => {
    expect(
      dimensionTypeHeuristic.resolve(FIXTURE_INPUTS["allowed restriction"])
        .display,
    ).toBe("bar");
  });
});
