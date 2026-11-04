import type { Dataset, RowValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

import { CUSTOMER_PROPERTIES_ID } from "./fixtures";

type PropertyProfile = {
  name: string;
  firstSeenDaysAgo: number;
  lastSeenDaysAgo: number;
  values: [string, number][];
};

export const CUSTOMER_COUNT = 2320;

const DAY_MS = 24 * 60 * 60 * 1000;

const range = (
  count: number,
  toValue: (index: number) => string,
  total: number,
) =>
  Array.from({ length: count }, (_, index): [string, number] => [
    toValue(index),
    Math.max(
      1,
      Math.round((total * 2 * (count - index)) / (count * (count + 1))),
    ),
  ]);

const PROPERTY_PROFILES: PropertyProfile[] = [
  {
    name: "plan",
    firstSeenDaysAgo: 1700,
    lastSeenDaysAgo: 0,
    values: [
      ["Free", 1204],
      ["Starter", 610],
      ["Pro", 388],
      ["Enterprise", 72],
    ],
  },
  {
    name: "region",
    firstSeenDaysAgo: 1700,
    lastSeenDaysAgo: 0,
    values: [
      ["AMER", 1120],
      ["EMEA", 690],
      ["APAC", 348],
    ],
  },
  {
    name: "hubspot_lifecycle_stage",
    firstSeenDaysAgo: 900,
    lastSeenDaysAgo: 1,
    values: [
      ["customer", 1210],
      ["lead", 402],
      ["mql", 240],
      ["sql", 166],
      ["evangelist", 82],
    ],
  },
  {
    name: "signup_source",
    firstSeenDaysAgo: 1650,
    lastSeenDaysAgo: 0,
    values: [
      ["website", 1022],
      ["referral", 431],
      ["partner", 228],
      ["event", 129],
    ],
  },
  {
    name: "seats",
    firstSeenDaysAgo: 1700,
    lastSeenDaysAgo: 0,
    values: [
      ...range(60, (index) => String((index + 1) * 5), 1597),
      ["10+", 38],
      ["unlimited", 9],
      ["", 3],
    ],
  },
  {
    name: "mrr_usd",
    firstSeenDaysAgo: 1500,
    lastSeenDaysAgo: 0,
    values: range(80, (index) => `${(index + 1) * 49}.00`, 1601),
  },
  {
    name: "industry",
    firstSeenDaysAgo: 1700,
    lastSeenDaysAgo: 1,
    values: [
      ["Software", 520],
      ["Financial services", 301],
      ["Retail", 244],
      ["Healthcare", 190],
      ["Education", 131],
      ["Media", 99],
    ],
  },
  {
    name: "csm_email",
    firstSeenDaysAgo: 1030,
    lastSeenDaysAgo: 0,
    values: range(
      18,
      (index) =>
        `${["ana", "bo", "chen", "dee", "eli", "fay", "gus", "hana", "ivo", "jun", "kai", "lea", "max", "nia", "oto", "pia", "raj", "sol"][index]}@acme.io`,
      951,
    ),
  },
  {
    name: "nps_score",
    firstSeenDaysAgo: 700,
    lastSeenDaysAgo: 3,
    values: range(11, (index) => String(10 - index), 640),
  },
  {
    name: "trial_ends_on",
    firstSeenDaysAgo: 1680,
    lastSeenDaysAgo: 0,
    values: range(
      40,
      (index) =>
        new Date(Date.now() + (index * 9 - 120) * DAY_MS)
          .toISOString()
          .slice(0, 10),
      278,
    ),
  },
  {
    name: "is_beta_tester",
    firstSeenDaysAgo: 640,
    lastSeenDaysAgo: 6,
    values: [
      ["true", 120],
      ["false", 66],
    ],
  },
  {
    name: "Plan Tier",
    firstSeenDaysAgo: 420,
    lastSeenDaysAgo: 0,
    values: [
      ["pro", 98],
      ["free", 41],
    ],
  },
  {
    name: "churn_risk",
    firstSeenDaysAgo: 3,
    lastSeenDaysAgo: 0,
    values: [
      ["low", 52],
      ["medium", 31],
      ["high", 10],
    ],
  },
  {
    name: "legacy_billing_id",
    firstSeenDaysAgo: 1700,
    lastSeenDaysAgo: 450,
    values: range(50, (index) => `LB-${10023 + index * 7}`, 510),
  },
];

const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY_MS).toISOString();

const sumCounts = (values: [string, number][]) =>
  values.reduce((sum, [, count]) => sum + count, 0);

const DISTINCT_VALUE_COUNTS: Record<string, number> = {
  legacy_billing_id: 510,
};

function dataset(columnNames: string[], rows: RowValue[][]): Dataset {
  return createMockDataset({
    data: createMockDatasetData({
      cols: columnNames.map((name) => createMockColumn({ name })),
      rows,
    }),
  });
}

export function getEntityCountDataset() {
  return dataset(["count"], [[CUSTOMER_COUNT]]);
}

export function getPropertySummaryDataset() {
  return dataset(
    ["property_name", "entities", "count", "values", "min", "max"],
    PROPERTY_PROFILES.map((profile) => {
      const entityCount = sumCounts(profile.values);
      return [
        profile.name,
        entityCount,
        entityCount,
        DISTINCT_VALUE_COUNTS[profile.name] ?? profile.values.length,
        daysAgo(profile.firstSeenDaysAgo),
        daysAgo(profile.lastSeenDaysAgo),
      ];
    }),
  );
}

export function getPropertyValuesDataset() {
  return dataset(
    ["property_name", "property_value", "entities"],
    PROPERTY_PROFILES.flatMap((profile) =>
      profile.values.map(([value, entities]) => [
        profile.name,
        value,
        entities,
      ]),
    ).sort((a, b) => Number(b[2]) - Number(a[2])),
  );
}

export function getPropertyRegistryDataset(query: unknown): Dataset | null {
  if (!isObject(query) || query["source-table"] !== CUSTOMER_PROPERTIES_ID) {
    return null;
  }
  const breakoutCount = Array.isArray(query.breakout)
    ? query.breakout.length
    : 0;
  if (breakoutCount === 0) {
    return getEntityCountDataset();
  }
  return breakoutCount === 1
    ? getPropertySummaryDataset()
    : getPropertyValuesDataset();
}
