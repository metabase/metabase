import { t } from "ttag";

import * as Lib from "metabase-lib";

import type { Example } from "../types";

type QueryFn = (query: Lib.Query, stageIndex: number) => Lib.Query;

function findBreakoutColumn(
  query: Lib.Query,
  stageIndex: number,
  longDisplayName: string,
): Lib.ColumnMetadata | undefined {
  return Lib.breakoutableColumns(query, stageIndex).find(
    (column) =>
      Lib.displayInfo(query, stageIndex, column).longDisplayName ===
      longDisplayName,
  );
}

function findTemporalBucket(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  shortName: string,
): Lib.Bucket | null {
  return (
    Lib.availableTemporalBuckets(query, stageIndex, column).find(
      (bucket) =>
        Lib.displayInfo(query, stageIndex, bucket).shortName === shortName,
    ) ?? null
  );
}

const withCount: QueryFn = (query, stageIndex) =>
  Lib.aggregateByCount(query, stageIndex);

/** Adds `<operator>` of the column named `longDisplayName`, e.g. Sum of Total. */
function withAggregation(
  operatorShortName: string,
  longDisplayName: string,
): QueryFn {
  return (query, stageIndex) => {
    const operator = Lib.availableAggregationOperators(query, stageIndex).find(
      (candidate) =>
        Lib.displayInfo(query, stageIndex, candidate).shortName ===
        operatorShortName,
    );
    const column = operator
      ? Lib.aggregationOperatorColumns(operator).find(
          (candidate) =>
            Lib.displayInfo(query, stageIndex, candidate).longDisplayName ===
            longDisplayName,
        )
      : undefined;
    if (!operator || !column) {
      return query;
    }
    return Lib.aggregate(
      query,
      stageIndex,
      Lib.aggregationClause(operator, column),
    );
  };
}

function withBreakout(longDisplayName: string): QueryFn {
  return (query, stageIndex) => {
    const column = findBreakoutColumn(query, stageIndex, longDisplayName);
    return column ? Lib.breakout(query, stageIndex, column) : query;
  };
}

function withTemporalBreakout(longDisplayName: string, unit: string): QueryFn {
  return (query, stageIndex) => {
    const column = findBreakoutColumn(query, stageIndex, longDisplayName);
    if (!column) {
      return query;
    }
    const bucket = findTemporalBucket(query, stageIndex, column, unit);
    return Lib.breakout(
      query,
      stageIndex,
      Lib.withTemporalBucket(column, bucket),
    );
  };
}

function withBinnedBreakout(longDisplayName: string): QueryFn {
  return (query, stageIndex) => {
    const column = findBreakoutColumn(query, stageIndex, longDisplayName);
    return column
      ? Lib.breakout(
          query,
          stageIndex,
          Lib.withDefaultBinning(query, stageIndex, column),
        )
      : query;
  };
}

function pipe(...steps: QueryFn[]): QueryFn {
  return (query, stageIndex) =>
    steps.reduce((result, step) => step(result, stageIndex), query);
}

const byMonth = withTemporalBreakout("Created At", "month");
const byCategory = withBreakout("Product → Category");
const byState = withBreakout("User → State");
const bySource = withBreakout("User → Source");

/**
 * One starting point per chart type the app offers, so every interaction idea
 * can be tried against every renderer. Pivot is left out: it needs the pivot
 * endpoint, not the ad hoc one the harness runs.
 */
export const EXAMPLES: Example[] = [
  {
    get label() {
      return t`Table`;
    },
    load: (query) => query,
    display: "table",
  },
  {
    get label() {
      return t`Line`;
    },
    load: pipe(withCount, byMonth),
    display: "line",
  },
  {
    get label() {
      return t`Area`;
    },
    load: pipe(withCount, byMonth, byCategory),
    display: "area",
    settings: { "stackable.stack_type": "stacked" },
  },
  {
    get label() {
      return t`Bar`;
    },
    load: pipe(withCount, byCategory),
    display: "bar",
  },
  {
    get label() {
      return t`Stacked bar`;
    },
    load: pipe(withCount, byMonth, byCategory),
    display: "bar",
    settings: { "stackable.stack_type": "stacked" },
  },
  {
    get label() {
      return t`Row`;
    },
    load: pipe(withCount, byState),
    display: "row",
  },
  {
    get label() {
      return t`Combo`;
    },
    load: pipe(withCount, withAggregation("sum", "Total"), byMonth),
    display: "combo",
  },
  {
    get label() {
      return t`Waterfall`;
    },
    load: pipe(withAggregation("sum", "Total"), byMonth),
    display: "waterfall",
  },
  {
    get label() {
      return t`Scatter`;
    },
    load: pipe(withCount, withBinnedBreakout("Total")),
    display: "scatter",
  },
  {
    get label() {
      return t`Pie`;
    },
    load: pipe(withCount, byCategory),
    display: "pie",
  },
  {
    get label() {
      return t`Funnel`;
    },
    load: pipe(withCount, bySource),
    display: "funnel",
  },
  {
    get label() {
      return t`Sankey`;
    },
    load: pipe(withCount, byCategory, bySource),
    display: "sankey",
  },
  {
    get label() {
      return t`Treemap`;
    },
    load: pipe(withCount, byCategory, bySource),
    display: "treemap",
  },
  {
    get label() {
      return t`Map`;
    },
    load: pipe(withCount, byState),
    display: "map",
  },
  {
    get label() {
      return t`Number`;
    },
    load: withCount,
    display: "scalar",
  },
  {
    get label() {
      return t`Trend`;
    },
    load: pipe(withCount, byMonth),
    display: "smartscalar",
  },
  {
    get label() {
      return t`Gauge`;
    },
    load: withCount,
    display: "gauge",
  },
  {
    get label() {
      return t`Progress`;
    },
    load: withCount,
    display: "progress",
    settings: { "progress.goal": 25000 },
  },
];
