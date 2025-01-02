import { strategies } from "metabase/admin/performance/constants/complex";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { getCollectionPathAsString } from "metabase/collections/utils";
import { PLUGIN_CACHING } from "metabase/plugins";
import { enterpriseOnlyCachingStrategies } from "metabase-enterprise/caching/constants";
import {
  type AdaptiveStrategy,
  CacheDurationUnit,
  type ScheduleStrategy,
} from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import type { CacheableItem } from "../types";

import { formatValueForSorting } from "./utils";

const hourlyScheduleStrategy: ScheduleStrategy = {
  type: "schedule",
  schedule: "0 0 * * * ?",
  refresh_automatically: false,
};
const dailyScheduleStrategy: ScheduleStrategy = {
  type: "schedule",
  schedule: "0 0 8 * * ?",
  refresh_automatically: false,
};
const weeklyScheduleStrategy: ScheduleStrategy = {
  type: "schedule",
  schedule: "0 0 8 ? * 2",
  refresh_automatically: false,
};
const monthlyScheduleStrategy: ScheduleStrategy = {
  type: "schedule",
  schedule: "0 0 8 ? * 2#1",
  refresh_automatically: false,
};
const adaptiveStrategy: AdaptiveStrategy = {
  type: "ttl",
  multiplier: 10,
  min_duration_ms: 1000,
};

const a = createMockCollection({ id: 2, name: "A" });
const b = createMockCollection({ id: 3, name: "B" });
const c = createMockCollection({ id: 4, name: "C" });
const d = createMockCollection({ id: 5, name: "D" });
const e = createMockCollection({ id: 6, name: "E" });
const f = createMockCollection({ id: 7, name: "F" });
const g = createMockCollection({ id: 8, name: "G" });
const h = createMockCollection({ id: 9, name: "H" });

const unsortedRows: CacheableItem[] = [
  {
    model: "question",
    id: 0,
    strategy: monthlyScheduleStrategy,
    collection: createMockCollection({
      ...c,
      effective_ancestors: [a, b],
    }),
  },
  {
    model: "question",
    id: 1,
    strategy: {
      type: "duration",
      duration: 100,
      unit: CacheDurationUnit.Hours,
      refresh_automatically: false,
    },
    collection: createMockCollection({
      ...b,
      effective_ancestors: [h, a],
    }),
  },
  {
    model: "question",
    id: 2,
    strategy: hourlyScheduleStrategy,
    collection: createMockCollection({
      ...a,
      effective_ancestors: [g, h],
    }),
  },
  {
    model: "question",
    id: 3,
    strategy: {
      type: "duration",
      duration: 10,
      unit: CacheDurationUnit.Hours,
      refresh_automatically: false,
    },
    collection: createMockCollection({
      ...d,
      effective_ancestors: [b, c],
    }),
  },
  {
    model: "question",
    id: 4,
    strategy: weeklyScheduleStrategy,
    collection: createMockCollection({
      ...h,
      effective_ancestors: [f, g],
    }),
  },
  {
    model: "question",
    id: 5,
    strategy: {
      type: "duration",
      duration: 1,
      unit: CacheDurationUnit.Hours,
      refresh_automatically: false,
    },
    collection: createMockCollection({
      ...f,
      effective_ancestors: [d, e],
    }),
  },
  {
    model: "question",
    id: 6,
    strategy: dailyScheduleStrategy,
    collection: createMockCollection({
      ...e,
      effective_ancestors: [c, d],
    }),
  },
  {
    model: "question",
    id: 7,
    strategy: adaptiveStrategy,
    collection: createMockCollection({
      ...g,
      effective_ancestors: [e, f],
    }),
  },
];

describe("StrategyEditorForQuestionsAndDashboards utilities", () => {
  describe("formatValueForSorting", () => {
    beforeAll(() => {
      PLUGIN_CACHING.strategies = {
        ...strategies,
        ...enterpriseOnlyCachingStrategies,
      };
    });

    it("sorts by policy correctly", () => {
      const sorted = unsortedRows.sort((rowA, rowB) => {
        const a = formatValueForSorting(rowA, "policy") as string;
        const b = formatValueForSorting(rowB, "policy") as string;
        return a.localeCompare(b);
      });
      const strategies = sorted.map(row => getShortStrategyLabel(row.strategy));
      expect(strategies).toEqual([
        "Adaptive",
        "Duration: 1h",
        "Duration: 10h",
        "Duration: 100h",
        "Scheduled: daily",
        "Scheduled: hourly",
        "Scheduled: monthly",
        "Scheduled: weekly",
      ]);
    });

    it("sorts by collection correctly", () => {
      const sorted = unsortedRows.sort((rowA, rowB) => {
        const a = formatValueForSorting(rowA, "collection") as string;
        const b = formatValueForSorting(rowB, "collection") as string;
        return a.localeCompare(b);
      });
      const collections = sorted.map(row =>
        row.collection ? getCollectionPathAsString(row.collection) : null,
      );
      expect(collections).toEqual([
        "A / B / C",
        "B / C / D",
        "C / D / E",
        "D / E / F",
        "E / F / G",
        "F / G / H",
        "G / H / A",
        "H / A / B",
      ]);
    });
  });
});
