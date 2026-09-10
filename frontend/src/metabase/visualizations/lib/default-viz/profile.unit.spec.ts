import { createMockFingerprint } from "metabase-types/api/mocks";

import {
  assignRole,
  assignRoleUninformative,
  columnType,
  estimateCardinality,
  inferTimeUnit,
  isAttributeColumn,
  isKeyColumn,
  normalizeFingerprint,
  profileColumns,
  promoteAggregatedIfGroupedKey,
} from "./profile";
import {
  countMeasure,
  makeInput,
  makeProfile,
  makeRowStats,
  timeDim,
} from "./test-fixtures";
import type { ProfileContext, RowStats } from "./types";

const MBQL_CONTEXT: ProfileContext = {
  isNative: false,
  native: null,
  aggregatedPrior: true,
  rowCount: null,
};

const numberInput = (overrides = {}) =>
  makeInput({
    effectiveType: "type/Float",
    baseType: "type/Float",
    ...overrides,
  });

describe("normalizeFingerprint", () => {
  it("reads the kebab-case API fingerprint", () => {
    const normalized = normalizeFingerprint(
      createMockFingerprint({
        global: { "distinct-count": 42, "nil%": 0.1 },
        type: {
          "type/Text": {
            "average-length": 7,
            "percent-email": 0,
            "percent-json": 0,
            "percent-state": 1,
            "percent-url": 0,
            "top-3-fraction": 0.5,
          },
        },
      }),
    );
    expect(normalized).toMatchObject({
      distinctCount: 42,
      nilFraction: 0.1,
      text: { averageLength: 7, percentState: 1, top3Fraction: 0.5 },
    });
  });

  it("reads the camelCase display-info fingerprint", () => {
    const normalized = normalizeFingerprint({
      global: { distinctCount: 9, "nil%": 0 },
      type: { "type/Number": { min: 1, max: "oops", avg: 4 } },
    });
    expect(normalized).toMatchObject({
      distinctCount: 9,
      number: { min: 1, avg: 4 },
    });
    expect(normalized?.number?.max).toBeUndefined();
  });

  it("returns null for a missing fingerprint", () => {
    expect(normalizeFingerprint(null)).toBeNull();
  });
});

describe("columnType", () => {
  it.each([
    ["type/DateTime", "temporal"],
    ["type/Date", "temporal"],
    ["type/Boolean", "boolean"],
    ["type/Integer", "number"],
    ["type/Text", "text"],
    ["type/MongoBSONID", "textlike"],
    ["type/JSON", "structured"],
    [null, "other"],
  ])("maps %s to %s", (type, expected) => {
    expect(columnType(type)).toBe(expected);
  });
});

describe("isKeyColumn", () => {
  it("treats primary keys, id-like names and database keys as keys", () => {
    expect(isKeyColumn(makeInput({ semantic: "type/PK" }))).toBe(true);
    expect(isKeyColumn(makeInput({ name: "user_id" }))).toBe(true);
    expect(isKeyColumn(makeInput({ name: "ID" }))).toBe(true);
    expect(isKeyColumn(makeInput({ databaseIsAutoIncrement: true }))).toBe(
      true,
    );
  });

  it("treats a near-unique number as a key", () => {
    const input = numberInput({
      fingerprint: { distinctCount: 9900, number: { top3Fraction: 0.001 } },
    });
    expect(isKeyColumn(input)).toBe(true);
  });

  it("never treats an aggregation as a key", () => {
    expect(
      isKeyColumn(makeInput({ name: "order_id", source: "aggregation" })),
    ).toBe(false);
  });
});

describe("isAttributeColumn", () => {
  it("flags free text, urls, hidden and preview-disabled columns", () => {
    expect(isAttributeColumn(makeInput({ semantic: "type/URL" }))).toBe(true);
    expect(
      isAttributeColumn(makeInput({ visibilityType: "details-only" })),
    ).toBe(true);
    expect(isAttributeColumn(makeInput({ previewDisplay: false }))).toBe(true);
    expect(
      isAttributeColumn(
        makeInput({ fingerprint: { text: { averageLength: 80 } } }),
      ),
    ).toBe(true);
    expect(
      isAttributeColumn(
        makeInput({ fingerprint: { text: { averageLength: 8 } } }),
      ),
    ).toBe(false);
  });
});

describe("assignRole", () => {
  it("assigns breakout roles from bucketing and semantics", () => {
    const cyclic = makeInput({
      source: "breakout",
      effectiveType: "type/Integer",
      unit: "day-of-week",
      unitKind: "extraction",
    });
    const binned = numberInput({
      source: "breakout",
      binning: { strategy: "default" },
    });
    const state = makeInput({ source: "breakout", semantic: "type/State" });
    const lat = numberInput({ source: "breakout", semantic: "type/Latitude" });

    expect(assignRole(cyclic, MBQL_CONTEXT).role).toBe("DIM_CYCLIC");
    expect(assignRole(binned, MBQL_CONTEXT).role).toBe("DIM_BINNED");
    expect(assignRole(state, MBQL_CONTEXT).role).toBe("DIM_GEO_REGION");
    expect(assignRole(lat, MBQL_CONTEXT).role).toBe("DIM_GEO_LATLON");
  });

  it("keeps an integer truncated date as a time dimension", () => {
    const year = makeInput({
      source: "breakout",
      effectiveType: "type/Integer",
      unit: "year",
      unitKind: "truncation",
    });
    expect(assignRole(year, MBQL_CONTEXT).role).toBe("DIM_TIME");
  });

  it("makes text and temporal aggregations attributes", () => {
    const maxDate = makeInput({
      source: "aggregation",
      effectiveType: "type/DateTime",
      agg: {
        op: "max",
        argType: "temporal",
        cumulative: false,
        share: false,
        additive: false,
      },
    });
    expect(assignRole(maxDate, MBQL_CONTEXT).role).toBe("ATTRIBUTE");
  });
});

describe("assignRoleUninformative", () => {
  it("scores text by cardinality", () => {
    expect(
      assignRoleUninformative(
        makeInput({ fingerprint: { distinctCount: 12 } }),
      ),
    ).toEqual({ role: "DIM_CATEGORY", confidence: 0.8 });
    expect(
      assignRoleUninformative(
        makeInput({ fingerprint: { distinctCount: 5000 } }),
      ),
    ).toEqual({
      role: "ATTRIBUTE",
      confidence: 0.7,
    });
  });

  it("scores numbers by semantics, name, and integer cardinality", () => {
    expect(
      assignRoleUninformative(numberInput({ semantic: "type/Currency" })),
    ).toEqual({
      role: "MEASURE",
      confidence: 0.9,
    });
    expect(
      assignRoleUninformative(numberInput({ name: "total_amount" })),
    ).toEqual({
      role: "MEASURE",
      confidence: 0.8,
    });
    expect(
      assignRoleUninformative(
        makeInput({
          effectiveType: "type/Integer",
          baseType: "type/Integer",
          fingerprint: { distinctCount: 5 },
        }),
      ),
    ).toEqual({ role: "DIM_ORDINAL_NUM", confidence: 0.6, altRole: "MEASURE" });
    expect(assignRoleUninformative(numberInput())).toEqual({
      role: "MEASURE",
      confidence: 0.7,
    });
  });
});

describe("estimateCardinality and inferTimeUnit", () => {
  const span = {
    earliest: "2016-04-30T00:00:00Z",
    latest: "2020-04-19T00:00:00Z",
  };

  it("counts time buckets from the fingerprint span", () => {
    const input = makeInput({
      effectiveType: "type/DateTime",
      unit: "month",
      unitKind: "truncation",
      fingerprint: { temporal: span },
    });
    expect(estimateCardinality(input, "DIM_TIME")).toEqual({
      estimate: 48,
      exact: false,
      source: "time-span",
    });
  });

  it("infers a unit that yields at least ten buckets", () => {
    const input = makeInput({
      effectiveType: "type/DateTime",
      fingerprint: { temporal: span },
    });
    expect(inferTimeUnit(input)).toBe("quarter");
    expect(inferTimeUnit(makeInput({ effectiveType: "type/DateTime" }))).toBe(
      "month",
    );
    expect(inferTimeUnit(makeInput({ effectiveType: "type/Date" }))).toBe(
      "day",
    );
  });

  it("uses bin counts for binned dimensions and fingerprints otherwise", () => {
    expect(
      estimateCardinality(
        numberInput({ binning: { strategy: "num-bins", numBins: 10 } }),
        "DIM_BINNED",
      ),
    ).toMatchObject({ estimate: 10, source: "binning" });
    expect(
      estimateCardinality(
        numberInput({ binning: { strategy: "default" } }),
        "DIM_BINNED",
      ),
    ).toMatchObject({ estimate: 20 });
    expect(
      estimateCardinality(
        makeInput({ fingerprint: { distinctCount: 7 } }),
        "DIM_CATEGORY",
      ),
    ).toMatchObject({ estimate: 7, source: "fingerprint" });
  });
});

describe("profileColumns", () => {
  it("applies exact cardinality from row stats", () => {
    const rowStats = makeRowStats({
      distinct: { 0: { count: 3, exact: true } },
    });
    const [profile] = profileColumns(
      [makeInput({ source: "breakout" })],
      MBQL_CONTEXT,
      rowStats,
    );
    expect(profile.cardinality).toEqual({
      estimate: 3,
      exact: true,
      source: "rows",
    });
  });
});

describe("promoteAggregatedIfGroupedKey", () => {
  const stats = (overrides: Partial<RowStats>): RowStats =>
    makeRowStats({ groupedKeyUnique: true, ...overrides });

  it("promotes a unique categorical key with a measure", () => {
    const profiles = [
      makeProfile({
        index: 0,
        name: "status",
        role: "DIM_CATEGORY",
        roleConfidence: 0.8,
      }),
      makeProfile({
        index: 1,
        name: "amount",
        role: "MEASURE",
        roleConfidence: 0.7,
      }),
    ];
    const result = promoteAggregatedIfGroupedKey(profiles, stats({}), false);
    expect(result.aggregated).toBe(true);
    expect(result.profiles[1].roleConfidence).toBe(0.9);
  });

  it("does not promote an event log keyed only by irregular timestamps", () => {
    const profiles = [timeDim(0, "created_at"), countMeasure(1, "amount")];
    const irregular = stats({
      timeSeries: {
        0: {
          sorted: true,
          regular: false,
          missingBucketFrac: 0,
          allDistinct: true,
          inferredUnit: null,
        },
      },
    });
    expect(
      promoteAggregatedIfGroupedKey(profiles, irregular, false).aggregated,
    ).toBe(false);
  });
});
