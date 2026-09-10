import {
  DEFAULT_DISPLAY_TYPE_BY_DIMENSION,
  type DimensionType as MetricsDimensionType,
} from "metabase/common/metrics/utils/dimension-types";
import type { MetricsViewerDisplayType } from "metabase/common/metrics-viewer";

import {
  FIXTURE_INPUTS,
  ONE_BY_ONE_COUNT,
  TIME_SERIES,
} from "./__fixtures__/inputs";
import {
  AVAILABLE_DISPLAYS_BY_DIMENSION_TYPE,
  DEFAULT_DISPLAY_BY_DIMENSION_TYPE,
  type DimensionDisplayType,
  constrainToAllowed,
  isOneByOne,
  resolveLegacyDefault,
  switchToScalarIfOneByOne,
} from "./shared";
import type { DimensionType, VizInput } from "./types";

// Compile-time parity: the local unions must equal the metrics-ui ones.
type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
const dimensionTypeParity: MutuallyAssignable<
  DimensionType,
  MetricsDimensionType
> = true;
const displayTypeParity: MutuallyAssignable<
  DimensionDisplayType,
  MetricsViewerDisplayType
> = true;

const DIMENSION_TYPES: readonly DimensionType[] = [
  "time",
  "geo",
  "category",
  "boolean",
  "numeric",
];

describe("viz-heuristics shared tables", () => {
  it("keeps the local type unions in sync with metrics-ui", () => {
    expect(dimensionTypeParity).toBe(true);
    expect(displayTypeParity).toBe(true);
  });

  it.each(DIMENSION_TYPES)(
    "%s: default display matches DEFAULT_DISPLAY_TYPE_BY_DIMENSION",
    (type) => {
      expect(DEFAULT_DISPLAY_BY_DIMENSION_TYPE[type]).toBe(
        DEFAULT_DISPLAY_TYPE_BY_DIMENSION[type],
      );
    },
  );

  it("offers every dimension type a scalar-or-chart display list", () => {
    expect(AVAILABLE_DISPLAYS_BY_DIMENSION_TYPE.scalar).toEqual(["scalar"]);
    for (const type of DIMENSION_TYPES) {
      expect(AVAILABLE_DISPLAYS_BY_DIMENSION_TYPE[type]).toContain(
        DEFAULT_DISPLAY_BY_DIMENSION_TYPE[type],
      );
    }
  });
});

describe("isOneByOne", () => {
  it("is true only for one row and one column", () => {
    expect(isOneByOne(ONE_BY_ONE_COUNT)).toBe(true);
    expect(isOneByOne(TIME_SERIES)).toBe(false);
    expect(isOneByOne({ ...ONE_BY_ONE_COUNT, rows: undefined })).toBe(false);
  });
});

describe("switchToScalarIfOneByOne", () => {
  it("switches non-scalar-like displays to scalar", () => {
    expect(
      switchToScalarIfOneByOne({ display: "table" }, ONE_BY_ONE_COUNT),
    ).toEqual({ display: "scalar" });
  });

  it("keeps gauge and progress", () => {
    expect(
      switchToScalarIfOneByOne({ display: "gauge" }, ONE_BY_ONE_COUNT),
    ).toEqual({ display: "gauge" });
  });
});

describe("constrainToAllowed", () => {
  const input: VizInput = {
    ...TIME_SERIES,
    hint: { display: "area" },
    allowed: ["bar", "area"],
  };

  it("keeps an allowed decision", () => {
    expect(constrainToAllowed({ display: "bar" }, input)).toEqual({
      display: "bar",
    });
  });

  it("prefers the first allowed alternative, keeping the trace", () => {
    expect(
      constrainToAllowed({ display: "line", trace: "t" }, input, [
        { display: "pie" },
        { display: "bar", settings: { "graph.dimensions": ["x"] } },
      ]),
    ).toEqual({
      display: "bar",
      settings: { "graph.dimensions": ["x"] },
      trace: "t",
    });
  });

  it("falls back to the hint, then the first allowed display", () => {
    expect(constrainToAllowed({ display: "line" }, input)).toEqual({
      display: "area",
      settings: undefined,
      trace: undefined,
    });
    expect(
      constrainToAllowed({ display: "line" }, { ...input, hint: undefined }),
    ).toEqual({ display: "bar", trace: undefined });
  });

  it("is a no-op without allowed", () => {
    expect(constrainToAllowed({ display: "line" }, TIME_SERIES)).toEqual({
      display: "line",
    });
  });
});

describe("resolveLegacyDefault", () => {
  it("uses the hint, then a table, when there is no query", () => {
    expect(resolveLegacyDefault(FIXTURE_INPUTS["lens hint"])).toEqual({
      display: "row",
      settings: { "graph.x_axis.labels_enabled": false },
    });
    expect(resolveLegacyDefault(TIME_SERIES)).toEqual({ display: "table" });
  });

  it("switches a 1×1 result to scalar", () => {
    expect(resolveLegacyDefault(ONE_BY_ONE_COUNT)).toEqual({
      display: "scalar",
    });
  });
});
