import {
  ACCOUNTS_CATALOG,
  MEASURES_ONLY_CATALOG,
  NO_SEGMENTS_NO_TIME_CATALOG,
} from "../__fixtures__/catalogs";
import type {
  CubeCard,
  CubeCardKind,
  CubeCatalog,
  CubeCoarseSettings,
  CubeDimension,
  DimensionType,
} from "../types";

import {
  BASE_CARD_BUDGET,
  DEFAULT_DIMENSION_COUNT,
  DEFAULT_DIMENSION_TYPE_CAPS,
  DEFAULT_MEASURE_COUNT,
  KIND_CAPS,
  LAYOUT_KIND_ORDER,
  LAYOUT_TYPE_ORDER,
  MAX_CARDS_PER_DIMENSION,
  MAX_CARD_BUDGET,
  MIN_DIMENSION_SCORE,
  type ScoredKind,
} from "./constants";

import { scoreAndPickGenerator } from "./index";

// ── Helpers ──

const { getDefaultSettings, generateCards } = scoreAndPickGenerator;

const generateDefault = (catalog: CubeCatalog) =>
  generateCards(catalog, getDefaultSettings(catalog));

const selectEverything = (catalog: CubeCatalog): CubeCoarseSettings => ({
  measureIds: catalog.measures.map((m) => m.id),
  dimensionKeys: catalog.dimensions.map((d) => d.key),
  filterDimensionKeys: [],
});

const withDimensions = (
  catalog: CubeCatalog,
  update: (dimension: CubeDimension) => CubeDimension,
): CubeCatalog => ({ ...catalog, dimensions: catalog.dimensions.map(update) });

const withoutOverview = (cards: CubeCard[]) =>
  cards.filter((card) => card.kind !== "overview");

const ofKind = (cards: CubeCard[], kind: CubeCardKind) =>
  cards.filter((card) => card.kind === kind);

const singleKey = (card: CubeCard) =>
  `${card.series[0].measureId}:${card.dimensionKeys[0]}`;

/** Renders a card as `[kind, series, dimensions, display]` using catalog names. */
function describeCard(catalog: CubeCatalog, card: CubeCard): string[] {
  const measureName = new Map(catalog.measures.map((m) => [m.id, m.name]));
  const dimensionLabel = new Map(
    catalog.dimensions.map((d) => [d.key, d.label]),
  );
  const segmentName = new Map(catalog.segments.map((s) => [s.id, s.name]));
  const series = card.series
    .map((entry) =>
      [
        measureName.get(entry.measureId),
        ...entry.segmentIds.map((id) => segmentName.get(id)),
      ].join(" | "),
    )
    .join(", ");
  const dimensions = card.dimensionKeys
    .map((key) => dimensionLabel.get(key))
    .join(" × ");
  return [card.kind, series, dimensions, card.display];
}

const KEY = {
  createdAt: "field:1",
  trialEndsAt: "field:2",
  canceledAt: "field:3",
  plan: "field:4",
  country: "field:5",
  seats: "field:6",
  source: "field:7",
  activeSubscription: "field:8",
} as const;

const CAPPED_KINDS: ScoredKind[] = [
  "time-by-category",
  "by-segment",
  "segment-vs-total",
  "segmented-single",
];

const MEASURE = {
  accounts: 1,
  totalSeats: 2,
  averageSeats: 3,
  payingAccounts: 4,
} as const;

// ── Tests ──

describe("scoreAndPickGenerator.getDefaultSettings", () => {
  it("picks the first DEFAULT_MEASURE_COUNT ranked measures", () => {
    const { measureIds } = getDefaultSettings(ACCOUNTS_CATALOG);
    expect(measureIds).toHaveLength(DEFAULT_MEASURE_COUNT);
    expect(measureIds).toEqual([
      MEASURE.totalSeats,
      MEASURE.payingAccounts,
      MEASURE.averageSeats,
    ]);
  });

  it("selects dimensions by score × type prior, capped per type", () => {
    const { dimensionKeys } = getDefaultSettings(ACCOUNTS_CATALOG);
    // Three time dimensions exist, but only the best one fits the time cap.
    expect(dimensionKeys).toEqual([
      KEY.createdAt,
      KEY.plan,
      KEY.source,
      KEY.country,
      KEY.activeSubscription,
    ]);
    expect(dimensionKeys.length).toBeLessThanOrEqual(DEFAULT_DIMENSION_COUNT);

    const dimensionByKey = new Map(
      ACCOUNTS_CATALOG.dimensions.map((d) => [d.key, d]),
    );
    const countByType = new Map<DimensionType, number>();
    for (const key of dimensionKeys) {
      const dimension = dimensionByKey.get(key);
      if (dimension) {
        countByType.set(
          dimension.type,
          (countByType.get(dimension.type) ?? 0) + 1,
        );
      }
    }
    for (const [type, count] of countByType) {
      expect(count).toBeLessThanOrEqual(DEFAULT_DIMENSION_TYPE_CAPS[type]);
    }
  });

  it("never selects dimensions below MIN_DIMENSION_SCORE", () => {
    const catalog = withDimensions(ACCOUNTS_CATALOG, (d) =>
      d.key === KEY.plan ? { ...d, score: MIN_DIMENSION_SCORE / 2 } : d,
    );
    const { dimensionKeys, filterDimensionKeys } = getDefaultSettings(catalog);
    expect(dimensionKeys).not.toContain(KEY.plan);
    expect(filterDimensionKeys).not.toContain(KEY.plan);
  });

  it("only selects dimensions that at least one default measure supports", () => {
    const catalog: CubeCatalog = {
      ...ACCOUNTS_CATALOG,
      measures: ACCOUNTS_CATALOG.measures.map((m) => ({
        ...m,
        dimensionIds: Object.fromEntries(
          Object.entries(m.dimensionIds).filter(([key]) => key !== KEY.plan),
        ),
      })),
    };
    expect(getDefaultSettings(catalog).dimensionKeys).not.toContain(KEY.plan);
  });

  it("filters on the best time dimension, then listable category/boolean dimensions", () => {
    const { filterDimensionKeys } = getDefaultSettings(ACCOUNTS_CATALOG);
    expect(filterDimensionKeys).toEqual([
      KEY.createdAt,
      KEY.plan,
      KEY.source,
      KEY.activeSubscription,
    ]);
  });

  it("handles catalogs with no dimensions or no measures", () => {
    expect(getDefaultSettings(MEASURES_ONLY_CATALOG)).toEqual({
      measureIds: [
        MEASURE.totalSeats,
        MEASURE.payingAccounts,
        MEASURE.averageSeats,
      ],
      dimensionKeys: [],
      filterDimensionKeys: [],
    });
    expect(
      getDefaultSettings({
        tableId: 1,
        measures: [],
        dimensions: [],
        segments: [],
      }),
    ).toEqual({ measureIds: [], dimensionKeys: [], filterDimensionKeys: [] });
  });
});

describe("scoreAndPickGenerator.generateCards", () => {
  it("emits one overview card per selected measure, in rank order, first", () => {
    const cards = generateDefault(ACCOUNTS_CATALOG);
    expect(cards.slice(0, 3).map((card) => card.series[0].measureId)).toEqual([
      MEASURE.totalSeats,
      MEASURE.payingAccounts,
      MEASURE.averageSeats,
    ]);
    expect(cards.slice(3).some((card) => card.kind === "overview")).toBe(false);
  });

  it("gives every selected measure and every selected dimension a single card", () => {
    const settings = getDefaultSettings(ACCOUNTS_CATALOG);
    const singles = ofKind(generateCards(ACCOUNTS_CATALOG, settings), "single");

    for (const measureId of settings.measureIds) {
      expect(
        singles.some((card) => card.series[0].measureId === measureId),
      ).toBe(true);
    }
    for (const key of settings.dimensionKeys) {
      expect(singles.some((card) => card.dimensionKeys[0] === key)).toBe(true);
    }
  });

  it("features a time-by-category card when a time and a low-cardinality dimension exist", () => {
    const cards = generateDefault(ACCOUNTS_CATALOG);
    const [featured] = ofKind(cards, "time-by-category");
    expect(featured).toBeDefined();
    expect(featured.dimensionKeys).toEqual([KEY.createdAt, KEY.plan]);
    expect(featured.series).toHaveLength(1);
    expect(featured.display).toBe("line");
  });

  it("does not feature a time-by-category card without a time dimension", () => {
    const cards = generateDefault(NO_SEGMENTS_NO_TIME_CATALOG);
    expect(ofKind(cards, "time-by-category")).toEqual([]);
  });

  it("does not feature a time-by-category card without a low-cardinality dimension", () => {
    const cards = generateCards(ACCOUNTS_CATALOG, {
      measureIds: [MEASURE.totalSeats, MEASURE.payingAccounts],
      dimensionKeys: [KEY.createdAt, KEY.country, KEY.seats],
      filterDimensionKeys: [],
    });
    expect(ofKind(cards, "time-by-category")).toEqual([]);
  });

  it("never uses a category with more than 10 distinct values as a second dimension", () => {
    const catalog = withDimensions(ACCOUNTS_CATALOG, (d) =>
      d.type === "category" ? { ...d, distinctCount: 50 } : d,
    );
    const cards = generateCards(catalog, {
      measureIds: [MEASURE.totalSeats],
      dimensionKeys: [KEY.createdAt, KEY.plan, KEY.source],
      filterDimensionKeys: [],
    });
    expect(cards.some((card) => card.dimensionKeys.length === 2)).toBe(false);

    // Booleans stay eligible as a second dimension.
    const withBoolean = generateCards(catalog, {
      measureIds: [MEASURE.totalSeats],
      dimensionKeys: [KEY.createdAt, KEY.plan, KEY.activeSubscription],
      filterDimensionKeys: [],
    });
    expect(
      ofKind(withBoolean, "time-by-category").map((card) => card.dimensionKeys),
    ).toEqual([[KEY.createdAt, KEY.activeSubscription]]);
  });

  it("emits segment-vs-total cards for additive measures only", () => {
    const dimensionKeys = [KEY.createdAt, KEY.plan];
    const additive = generateCards(ACCOUNTS_CATALOG, {
      measureIds: [MEASURE.totalSeats],
      dimensionKeys,
      filterDimensionKeys: [],
    });
    expect(ofKind(additive, "segment-vs-total")).toHaveLength(1);
    expect(ofKind(additive, "segment-vs-total")[0].series).toEqual([
      { measureId: MEASURE.totalSeats, segmentIds: [] },
      { measureId: MEASURE.totalSeats, segmentIds: [11] },
    ]);

    const nonAdditive = generateCards(ACCOUNTS_CATALOG, {
      measureIds: [MEASURE.averageSeats],
      dimensionKeys,
      filterDimensionKeys: [],
    });
    expect(ofKind(nonAdditive, "segment-vs-total")).toEqual([]);
  });

  it("emits no segment kinds when the table has no segments", () => {
    const catalog: CubeCatalog = { ...ACCOUNTS_CATALOG, segments: [] };
    const cards = generateCards(catalog, selectEverything(catalog));
    expect(ofKind(cards, "by-segment")).toEqual([]);
    expect(ofKind(cards, "segment-vs-total")).toEqual([]);
    expect(ofKind(cards, "segmented-single")).toEqual([]);
    expect(
      cards.every((card) =>
        card.series.every((s) => s.segmentIds.length === 0),
      ),
    ).toBe(true);
  });

  it("respects kind caps, including one segment-vs-total per measure", () => {
    const cards = generateCards(
      ACCOUNTS_CATALOG,
      selectEverything(ACCOUNTS_CATALOG),
    );
    for (const kind of CAPPED_KINDS) {
      expect(ofKind(cards, kind).length).toBeLessThanOrEqual(
        KIND_CAPS[kind] ?? Infinity,
      );
    }
    const segmentVsTotalMeasures = ofKind(cards, "segment-vs-total").map(
      (card) => card.series[0].measureId,
    );
    expect(new Set(segmentVsTotalMeasures).size).toBe(
      segmentVsTotalMeasures.length,
    );
  });

  it("stops filling an x-axis dimension at MAX_CARDS_PER_DIMENSION even with candidates left", () => {
    // 3 measures × 2 dimensions = 6 single candidates and a budget of 10, so
    // only the per-dimension cap can stop the fill pass early.
    const dimensions = ACCOUNTS_CATALOG.dimensions.filter(
      (d) => d.key === KEY.plan || d.key === KEY.source,
    );
    const catalog: CubeCatalog = {
      ...ACCOUNTS_CATALOG,
      segments: [],
      dimensions,
      measures: ACCOUNTS_CATALOG.measures
        .filter((m) => m.id !== MEASURE.accounts)
        .map((m) => ({
          ...m,
          dimensionIds: { [KEY.plan]: "plan", [KEY.source]: "source" },
        })),
    };
    const singles = ofKind(
      generateCards(catalog, selectEverything(catalog)),
      "single",
    );

    expect(singles).toHaveLength(2 * MAX_CARDS_PER_DIMENSION);
    for (const key of [KEY.plan, KEY.source]) {
      expect(
        singles.filter((card) => card.dimensionKeys[0] === key),
      ).toHaveLength(MAX_CARDS_PER_DIMENSION);
    }
  });

  it("keeps the non-overview card count within [BASE_CARD_BUDGET, MAX_CARD_BUDGET] when there are enough candidates", () => {
    const defaultCards = withoutOverview(generateDefault(ACCOUNTS_CATALOG));
    expect(defaultCards).toHaveLength(BASE_CARD_BUDGET);

    const everything = withoutOverview(
      generateCards(ACCOUNTS_CATALOG, selectEverything(ACCOUNTS_CATALOG)),
    );
    expect(everything.length).toBeGreaterThanOrEqual(BASE_CARD_BUDGET);
    expect(everything.length).toBeLessThanOrEqual(MAX_CARD_BUDGET);
  });

  it("ignores unknown ids in settings", () => {
    const cards = generateCards(ACCOUNTS_CATALOG, {
      measureIds: [999, MEASURE.totalSeats],
      dimensionKeys: ["field:999", KEY.createdAt],
      filterDimensionKeys: ["field:999"],
    });
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.series.every((s) => s.measureId === MEASURE.totalSeats)).toBe(
        true,
      );
      expect(card.dimensionKeys.every((key) => key === KEY.createdAt)).toBe(
        true,
      );
    }
  });

  it("is deterministic and independent of settings order", () => {
    const settings = getDefaultSettings(ACCOUNTS_CATALOG);
    const reordered: CubeCoarseSettings = {
      measureIds: [...settings.measureIds].reverse(),
      dimensionKeys: [...settings.dimensionKeys].reverse(),
      filterDimensionKeys: [],
    };
    expect(generateCards(ACCOUNTS_CATALOG, reordered)).toEqual(
      generateCards(ACCOUNTS_CATALOG, settings),
    );
  });

  it("lays cards out by kind, then by first-dimension type", () => {
    const cards = generateCards(
      ACCOUNTS_CATALOG,
      selectEverything(ACCOUNTS_CATALOG),
    );
    const dimensionByKey = new Map(
      ACCOUNTS_CATALOG.dimensions.map((d) => [d.key, d]),
    );
    const layoutKey = (card: CubeCard) => {
      const [firstKey] = card.dimensionKeys;
      const dimension = firstKey ? dimensionByKey.get(firstKey) : undefined;
      return [
        LAYOUT_KIND_ORDER.indexOf(card.kind),
        dimension ? LAYOUT_TYPE_ORDER.indexOf(dimension.type) : -1,
      ];
    };
    const keys = cards.map(layoutKey);
    const sorted = [...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(keys).toEqual(sorted);
    expect(new Set(cards.map((card) => card.kind)).size).toBeGreaterThan(3);
  });

  describe("example output (§9.7)", () => {
    // Guards against accidental tuning changes. Update on purpose when tuning.
    it("matches the accounts fixture table", () => {
      const cards = generateDefault(ACCOUNTS_CATALOG);
      expect(cards.map((card) => describeCard(ACCOUNTS_CATALOG, card))).toEqual(
        [
          ["overview", "Total seats", "", "scalar"],
          ["overview", "Paying accounts", "", "scalar"],
          ["overview", "Average seats", "", "scalar"],
          [
            "by-segment",
            "Paying accounts, Paying accounts | Enterprise, Paying accounts | Legacy plan",
            "",
            "scalar",
          ],
          ["single", "Total seats", "Created At", "line"],
          ["single", "Average seats", "Country", "map"],
          ["single", "Paying accounts", "Plan", "bar"],
          ["single", "Average seats", "Source", "bar"],
          ["single", "Total seats", "Plan", "bar"],
          ["single", "Paying accounts", "Source", "bar"],
          ["single", "Paying accounts", "Active Subscription", "bar"],
          ["time-by-category", "Total seats", "Created At × Plan", "line"],
          [
            "segment-vs-total",
            "Total seats, Total seats | Enterprise",
            "Created At",
            "line",
          ],
        ],
      );
    });

    it("with no segments and no time dimensions: 3 overviews, 2 maps, 7 bars", () => {
      const cards = generateDefault(NO_SEGMENTS_NO_TIME_CATALOG);
      expect(ofKind(cards, "overview")).toHaveLength(3);
      expect(
        withoutOverview(cards).every((card) => card.kind === "single"),
      ).toBe(true);
      expect(cards.filter((card) => card.display === "map")).toHaveLength(2);
      expect(cards.filter((card) => card.display === "bar")).toHaveLength(7);
    });

    it("with no dimensions: 3 overviews plus one by-segment card", () => {
      const cards = generateDefault(MEASURES_ONLY_CATALOG);
      expect(
        cards.map((card) => describeCard(MEASURES_ONLY_CATALOG, card)),
      ).toEqual([
        ["overview", "Total seats", "", "scalar"],
        ["overview", "Paying accounts", "", "scalar"],
        ["overview", "Average seats", "", "scalar"],
        [
          "by-segment",
          "Total seats, Total seats | Enterprise, Total seats | Legacy plan",
          "",
          "scalar",
        ],
      ]);
    });
  });

  it("emits unique single cards (no measure × dimension repeats)", () => {
    const singles = ofKind(
      generateCards(ACCOUNTS_CATALOG, selectEverything(ACCOUNTS_CATALOG)),
      "single",
    );
    const keys = singles.map(singleKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
