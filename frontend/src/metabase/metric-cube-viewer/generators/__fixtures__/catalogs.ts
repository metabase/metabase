// Plain-data catalogs shared by all generator tests.
import type { CubeCatalog, CubeDimensionKey, CubeMeasure } from "../types";

const ACCOUNT_DIMENSION_KEYS: CubeDimensionKey[] = [
  "field:1",
  "field:2",
  "field:3",
  "field:4",
  "field:5",
  "field:6",
  "field:7",
  "field:8",
];

const supports = (keys: CubeDimensionKey[]): CubeMeasure["dimensionIds"] =>
  Object.fromEntries(keys.map((key) => [key, `dimension-${key}`]));

/** Accounts-like table. Interestingness scores are assumed values. */
export const ACCOUNTS_CATALOG: CubeCatalog = {
  tableId: 9,
  measures: [
    {
      id: 1,
      name: "Accounts",
      isAdditive: true,
      dimensionIds: supports(ACCOUNT_DIMENSION_KEYS),
    },
    {
      id: 3,
      name: "Average seats",
      isAdditive: false,
      // "Seats" (field:6) is the aggregated column, so it's excluded.
      dimensionIds: supports(
        ACCOUNT_DIMENSION_KEYS.filter((key) => key !== "field:6"),
      ),
    },
    {
      id: 4,
      name: "Paying accounts",
      isAdditive: true,
      dimensionIds: supports(ACCOUNT_DIMENSION_KEYS),
    },
    {
      id: 2,
      name: "Total seats",
      isAdditive: true,
      dimensionIds: supports(
        ACCOUNT_DIMENSION_KEYS.filter((key) => key !== "field:6"),
      ),
    },
  ],
  dimensions: [
    {
      key: "field:8",
      label: "Active Subscription",
      type: "boolean",
      score: 0.5,
      distinctCount: 2,
      canListValues: true,
    },
    {
      key: "field:3",
      label: "Canceled At",
      type: "time",
      score: 0.4,
      distinctCount: 600,
      canListValues: false,
    },
    {
      key: "field:5",
      label: "Country",
      type: "geo",
      score: 0.66,
      distinctCount: 80,
      canListValues: true,
    },
    {
      key: "field:1",
      label: "Created At",
      type: "time",
      score: 0.82,
      distinctCount: 2400,
      canListValues: false,
    },
    {
      key: "field:4",
      label: "Plan",
      type: "category",
      score: 0.78,
      distinctCount: 3,
      canListValues: true,
    },
    {
      key: "field:6",
      label: "Seats",
      type: "numeric",
      score: 0.55,
      distinctCount: 120,
      canListValues: false,
    },
    {
      key: "field:7",
      label: "Source",
      type: "category",
      score: 0.74,
      distinctCount: 5,
      canListValues: true,
    },
    {
      key: "field:2",
      label: "Trial Ends At",
      type: "time",
      score: 0.7,
      distinctCount: 2300,
      canListValues: false,
    },
  ],
  segments: [
    { id: 11, name: "Enterprise" },
    { id: 10, name: "Legacy plan" },
  ],
};

export const NO_SEGMENTS_NO_TIME_CATALOG: CubeCatalog = {
  ...ACCOUNTS_CATALOG,
  segments: [],
  dimensions: ACCOUNTS_CATALOG.dimensions.filter((d) => d.type !== "time"),
};

export const MEASURES_ONLY_CATALOG: CubeCatalog = {
  ...ACCOUNTS_CATALOG,
  dimensions: [],
  measures: ACCOUNTS_CATALOG.measures.map((m) => ({ ...m, dimensionIds: {} })),
};

export const EMPTY_CATALOG: CubeCatalog = {
  tableId: 1,
  measures: [],
  dimensions: [],
  segments: [],
};

export const FIXTURE_CATALOGS: Record<string, CubeCatalog> = {
  accounts: ACCOUNTS_CATALOG,
  noSegmentsNoTime: NO_SEGMENTS_NO_TIME_CATALOG,
  measuresOnly: MEASURES_ONLY_CATALOG,
  empty: EMPTY_CATALOG,
};
