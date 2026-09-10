import {
  DEFAULT_DISPLAY_TYPE_BY_DIMENSION,
  type DimensionType,
} from "metabase/common/metrics/utils/dimension-types";
// Test-only cross-feature import: the spec requires the display tables in
// shared.ts to stay in parity with the metrics viewer's breakout config, and
// that config is not exposed through a shared-tier module.
import { getDimensionBreakoutConfig } from "metabase/metrics-viewer/utils/dimension-breakout-config";

import { ACCOUNTS_CATALOG } from "./__fixtures__/catalogs";
import {
  AVAILABLE_DISPLAYS_BY_TYPE,
  DEFAULT_DISPLAY_BY_TYPE,
  isLowCardinality,
  makeCard,
  overviewCard,
  resolveSettings,
  seededShuffle,
} from "./shared";
import type { CubeDimension } from "./types";

const DIMENSION_TYPES: DimensionType[] = [
  "time",
  "geo",
  "category",
  "boolean",
  "numeric",
];

describe("display tables", () => {
  it("DEFAULT_DISPLAY_BY_TYPE matches the metrics viewer defaults", () => {
    expect(DEFAULT_DISPLAY_BY_TYPE).toEqual(DEFAULT_DISPLAY_TYPE_BY_DIMENSION);
  });

  it.each([...DIMENSION_TYPES, "scalar" as const])(
    "AVAILABLE_DISPLAYS_BY_TYPE.%s matches the metrics viewer breakout config",
    (type) => {
      expect(AVAILABLE_DISPLAYS_BY_TYPE[type]).toEqual(
        getDimensionBreakoutConfig(type).availableDisplayTypes.map(
          (option) => option.type,
        ),
      );
    },
  );

  it("every default display is one of the available displays", () => {
    for (const type of DIMENSION_TYPES) {
      expect(AVAILABLE_DISPLAYS_BY_TYPE[type]).toContain(
        DEFAULT_DISPLAY_BY_TYPE[type],
      );
    }
  });
});

describe("makeCard", () => {
  it("builds the same id for the same tuple", () => {
    const build = () =>
      makeCard(
        "segment-vs-total",
        [
          { measureId: 2, segmentIds: [] },
          { measureId: 2, segmentIds: [11] },
        ],
        ["field:1"],
        "line",
      );
    expect(build()).toEqual(build());
    expect(build().id).toBe("segment-vs-total:m2+m2|s11:field:1");
  });

  it("builds different ids for different tuples", () => {
    const total = { measureId: 2, segmentIds: [] };
    const ids = [
      makeCard("single", [total], ["field:1"], "line"),
      makeCard("single", [total], ["field:2"], "line"),
      makeCard(
        "single",
        [{ measureId: 3, segmentIds: [] }],
        ["field:1"],
        "line",
      ),
      makeCard(
        "single",
        [{ measureId: 2, segmentIds: [10] }],
        ["field:1"],
        "line",
      ),
      makeCard("segmented-single", [total], ["field:1"], "line"),
      makeCard("time-by-category", [total], ["field:1", "field:4"], "line"),
    ].map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ignores display when building the id, so display overrides survive", () => {
    const total = { measureId: 2, segmentIds: [] };
    expect(makeCard("single", [total], ["field:1"], "line").id).toBe(
      makeCard("single", [total], ["field:1"], "bar").id,
    );
  });

  it("builds a scalar overview card without dimensions", () => {
    expect(overviewCard(ACCOUNTS_CATALOG.measures[0])).toEqual({
      id: "overview:m1",
      kind: "overview",
      series: [{ measureId: 1, segmentIds: [] }],
      dimensionKeys: [],
      display: "scalar",
    });
  });
});

describe("resolveSettings", () => {
  it("keeps settings order and drops unknown ids", () => {
    const { measures, dimensions } = resolveSettings(
      ACCOUNTS_CATALOG,
      [4, 999, 1],
      ["field:7", "field:999", "field:1"],
    );
    expect(measures.map((m) => m.name)).toEqual([
      "Paying accounts",
      "Accounts",
    ]);
    expect(dimensions.map((d) => d.label)).toEqual(["Source", "Created At"]);
  });
});

describe("isLowCardinality", () => {
  const dimension = (overrides: Partial<CubeDimension>): CubeDimension => ({
    key: "field:1",
    label: "Dimension",
    type: "category",
    score: 0.5,
    distinctCount: 5,
    canListValues: true,
    ...overrides,
  });

  it("is true for booleans regardless of distinct count", () => {
    expect(
      isLowCardinality(dimension({ type: "boolean", distinctCount: null }), 10),
    ).toBe(true);
  });

  it("is true for categories with 2..max distinct values only", () => {
    expect(isLowCardinality(dimension({ distinctCount: 2 }), 10)).toBe(true);
    expect(isLowCardinality(dimension({ distinctCount: 10 }), 10)).toBe(true);
    expect(isLowCardinality(dimension({ distinctCount: 1 }), 10)).toBe(false);
    expect(isLowCardinality(dimension({ distinctCount: 11 }), 10)).toBe(false);
    expect(isLowCardinality(dimension({ distinctCount: null }), 10)).toBe(
      false,
    );
  });

  it("is false for other dimension types", () => {
    expect(
      isLowCardinality(dimension({ type: "time", distinctCount: 3 }), 10),
    ).toBe(false);
    expect(
      isLowCardinality(dimension({ type: "geo", distinctCount: 3 }), 10),
    ).toBe(false);
    expect(
      isLowCardinality(dimension({ type: "numeric", distinctCount: 3 }), 10),
    ).toBe(false);
  });
});

describe("seededShuffle", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];

  it("is stable for the same seed", () => {
    expect(seededShuffle(items, 9)).toEqual(seededShuffle(items, 9));
  });

  it("differs across seeds", () => {
    const orders = new Set(
      [1, 2, 3, 4, 5].map((seed) => seededShuffle(items, seed).join(",")),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("is a permutation and does not mutate its input", () => {
    const input = [...items];
    const shuffled = seededShuffle(input, 42);
    expect(input).toEqual(items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });
});
