import { t } from "ttag";

import * as Lib from "metabase-lib";

import type { Example } from "../types";

import { clearFilters } from "./examples";

const STAGE_INDEX = 0;

type Builder = {
  query: Lib.Query;
  col: (longDisplayName: string) => Lib.ColumnMetadata;
};

/** Thrown when the Sample Database lacks a column; the example then loads the plain query. */
class MissingColumnError extends Error {}

function builder(query: Lib.Query): Builder {
  const columns = Lib.filterableColumns(query, STAGE_INDEX);
  return {
    query,
    col: (longDisplayName) => {
      const column = columns.find(
        (candidate) =>
          Lib.displayInfo(query, STAGE_INDEX, candidate).longDisplayName ===
          longDisplayName,
      );
      if (!column) {
        throw new MissingColumnError(longDisplayName);
      }
      return column;
    },
  };
}

function safely(load: (query: Lib.Query) => Lib.Query) {
  return (query: Lib.Query) => {
    try {
      return load(query);
    } catch (error) {
      if (error instanceof MissingColumnError) {
        console.warn(`Example skipped, no column ${error.message}`);
        return query;
      }
      throw error;
    }
  };
}

const is = (column: Lib.ColumnMetadata, value: string) =>
  Lib.stringFilterClause({
    operator: "=",
    column,
    values: [value],
    options: {},
  });

const isNotEmpty = (column: Lib.ColumnMetadata) =>
  Lib.defaultFilterClause({ operator: "not-null", column });

const and = (...args: Lib.ExpressionClause[]) =>
  Lib.expressionClause("and", args);
const or = (...args: Lib.ExpressionClause[]) =>
  Lib.expressionClause("or", args);
const not = (arg: Lib.ExpressionClause) => Lib.expressionClause("not", [arg]);

const in2026 = (column: Lib.ColumnMetadata) =>
  Lib.specificDateFilterClause({
    operator: "between",
    column,
    values: [new Date(2026, 0, 1), new Date(2026, 11, 31)],
    hasTime: false,
  });

function withFilters(
  query: Lib.Query,
  clauses: Lib.ExpressionClause[],
  stageIndex = STAGE_INDEX,
): Lib.Query {
  return clauses.reduce(
    (nextQuery, clause) => Lib.filter(nextQuery, stageIndex, clause),
    stageIndex === STAGE_INDEX ? clearFilters(query, stageIndex) : query,
  );
}

function findBreakoutColumn(query: Lib.Query, longDisplayName: string) {
  return Lib.breakoutableColumns(query, STAGE_INDEX).find(
    (column) =>
      Lib.displayInfo(query, STAGE_INDEX, column).longDisplayName ===
      longDisplayName,
  );
}

function aggregate(
  query: Lib.Query,
  operatorShortName: "count" | "sum",
  columnName?: string,
): Lib.Query {
  const operator = Lib.availableAggregationOperators(query, STAGE_INDEX).find(
    (candidate) =>
      Lib.displayInfo(query, STAGE_INDEX, candidate).shortName ===
      operatorShortName,
  );
  if (!operator) {
    return query;
  }
  const column = columnName
    ? Lib.aggregationOperatorColumns(operator).find(
        (candidate) =>
          Lib.displayInfo(query, STAGE_INDEX, candidate).name === columnName,
      )
    : undefined;
  return Lib.aggregate(
    query,
    STAGE_INDEX,
    Lib.aggregationClause(operator, column),
  );
}

function breakout(
  query: Lib.Query,
  longDisplayName: string,
  bucketShortName?: string,
): Lib.Query {
  const column = findBreakoutColumn(query, longDisplayName);
  if (!column) {
    throw new MissingColumnError(longDisplayName);
  }
  const bucket = bucketShortName
    ? Lib.availableTemporalBuckets(query, STAGE_INDEX, column).find(
        (candidate) =>
          Lib.displayInfo(query, STAGE_INDEX, candidate).shortName ===
          bucketShortName,
      )
    : undefined;
  return Lib.breakout(
    query,
    STAGE_INDEX,
    bucket ? Lib.withTemporalBucket(column, bucket) : column,
  );
}

/** Sorts the summary stage by one of its aggregations, biggest first. */
function sortedByAggregation(query: Lib.Query, aggregationName: string) {
  const stageIndex = Lib.stageCount(query) - 1;
  const column = Lib.orderableColumns(query, stageIndex).find(
    (candidate) =>
      Lib.displayInfo(query, stageIndex, candidate).displayName ===
      aggregationName,
  );
  return column ? Lib.orderBy(query, stageIndex, column, "desc") : query;
}

/**
 * Filters on the summary: `[aggregation] >= value`, one per entry, AND-ed,
 * then sorted by `sortBy`. Sorting sits on the same stage as the thresholds:
 * a sort or limit before them would rank groups the thresholds then drop.
 */
function withSummaryThresholds(
  query: Lib.Query,
  thresholds: { aggregationName: string; value: number }[],
  sortBy: string,
): Lib.Query {
  const summaryStageIndex = STAGE_INDEX + 1;
  const withStage = Lib.appendStage(query);
  const columns = Lib.filterableColumns(withStage, summaryStageIndex);
  const clauses = thresholds.flatMap(({ aggregationName, value }) => {
    const column = columns.find(
      (candidate) =>
        Lib.displayInfo(withStage, summaryStageIndex, candidate).displayName ===
        aggregationName,
    );
    return column
      ? [Lib.numberFilterClause({ operator: ">=", column, values: [value] })]
      : [];
  });
  return sortedByAggregation(
    withFilters(withStage, clauses, summaryStageIndex),
    sortBy,
  );
}

const discountOrAffiliate = ({ col }: Builder) =>
  or(isNotEmpty(col("Discount")), is(col("User → Source"), "Affiliate"));

/** Coupons or affiliate commissions: 5,090 of 18,760 orders. */
const discountedOrAffiliate = safely((query) =>
  withFilters(query, [discountOrAffiliate(builder(query))]),
);

/** The complement, a NOT over an OR: 13,670 orders. */
const fullMargin = safely((query) =>
  withFilters(query, [not(discountOrAffiliate(builder(query)))]),
);

/** Customers acquired by the two ad tests: Google in CA (124 orders), Facebook in TX (226). */
const adTestCustomers = safely((query) => {
  const { col } = builder(query);
  const state = col("User → State");
  const source = col("User → Source");
  return withFilters(query, [
    or(
      and(is(state, "CA"), is(source, "Google")),
      and(is(state, "TX"), is(source, "Facebook")),
    ),
  ]);
});

/** 481 orders: Total tops out at ~$159, Quantity at 100. */
const checkBeforeShipping = safely((query) => {
  const { col } = builder(query);
  return withFilters(query, [
    or(
      Lib.numberFilterClause({
        operator: ">",
        column: col("Total"),
        values: [150],
      }),
      Lib.numberFilterClause({
        operator: ">=",
        column: col("Quantity"),
        values: [10],
      }),
    ),
  ]);
});

/** 86 orders. Sample orders start in May 2025, so Q4 2025 is the first full quarter. */
const q4Promos = safely((query) => {
  const b = builder(query);
  return withFilters(query, [
    Lib.specificDateFilterClause({
      operator: "between",
      column: b.col("Created At"),
      values: [new Date(2025, 9, 1), new Date(2025, 11, 31)],
      hasTime: false,
    }),
    discountOrAffiliate(b),
    not(is(b.col("Product → Category"), "Doohickey")),
  ]);
});

/** 8 states clear $50k; TX leads at ~$108k. */
const statesOver50k = safely((query) =>
  withSummaryThresholds(
    breakout(
      aggregate(clearFilters(query, STAGE_INDEX), "sum", "TOTAL"),
      "User → State",
    ),
    [{ aggregationName: "Sum of Total", value: 50000 }],
    "Sum of Total",
  ),
);

/** 25 customers with 3+ such orders in 2026 adding up to $300+. */
const repeatBuyers = safely((query) => {
  const { col } = builder(query);
  const rows = withFilters(query, [
    in2026(col("Created At")),
    or(is(col("User → Source"), "Google"), isNotEmpty(col("Discount"))),
  ]);
  return withSummaryThresholds(
    breakout(
      aggregate(aggregate(rows, "count"), "sum", "TOTAL"),
      "User → Name",
    ),
    [
      { aggregationName: "Count", value: 3 },
      { aggregationName: "Sum of Total", value: 300 },
    ],
    "Sum of Total",
  );
});

/** 3,610 orders over 12 months and 4 categories: the chart to click on. */
const monthlyByCategory = safely((query) => {
  const { col } = builder(query);
  const rows = withFilters(query, [in2026(col("Created At"))]);
  return breakout(
    breakout(aggregate(rows, "count"), "Created At", "month"),
    "Product → Category",
  );
});

/**
 * Questions people actually ask of the Sample Database, each with an OR that
 * spans different columns (a same-column OR is just a multi-value "is").
 * Counts in the comments were checked against the Sample Database.
 */
export const REALISTIC_EXAMPLES: Example[] = [
  {
    get label() {
      return t`Orders by category, 2026`;
    },
    get title() {
      return t`Monthly orders by category, 2026`;
    },
    load: monthlyByCategory,
    get hint() {
      return t`Count of orders by Created At: Month and Product → Category, for orders created in 2026. Click a bar: row filters ("Only Gizmo", "Only Gizmo in March 2026") or a threshold on Count.`;
    },
    display: "bar",
  },
  {
    get label() {
      return t`Repeat buyers, 2026`;
    },
    get title() {
      return t`Repeat buyers via Google or coupons, 2026`;
    },
    load: repeatBuyers,
    get hint() {
      return t`Rows: orders from 2026 that were discounted or placed by a customer who came from Google. Count and Sum of Total by customer. After summarizing: Count ≥ 3 and Sum of Total ≥ 300, biggest spenders first (25 customers).`;
    },
    display: "bar",
  },
  {
    get label() {
      return t`States over $50k`;
    },
    get title() {
      return t`States with $50k+ in revenue`;
    },
    load: statesOver50k,
    get hint() {
      return t`Sum of Total by User → State, all time. After summarizing: Sum of Total ≥ 50,000, highest first (8 states).`;
    },
    display: "bar",
  },
  {
    get label() {
      return t`Discounted or affiliate`;
    },
    get title() {
      return t`Discounted or affiliate orders`;
    },
    load: discountedOrAffiliate,
    get hint() {
      return t`Discount is not empty or User → Source is Affiliate: the orders where a coupon or an affiliate commission eats into margin (5,090 orders).`;
    },
  },
  {
    get label() {
      return t`Full-margin orders`;
    },
    get title() {
      return t`Full-margin orders (no discount, no affiliate)`;
    },
    load: fullMargin,
    get hint() {
      return t`not (Discount is not empty or User → Source is Affiliate): a NOT over an OR (13,670 orders).`;
    },
  },
  {
    get label() {
      return t`Ad-test customers`;
    },
    get title() {
      return t`Orders from ad-test customers: CA Google, TX Facebook`;
    },
    load: adTestCustomers,
    get hint() {
      return t`(User → State = CA and User → Source = Google) or (User → State = TX and User → Source = Facebook): customers acquired by the two regional campaigns (350 orders).`;
    },
  },
  {
    get label() {
      return t`Check before shipping`;
    },
    get title() {
      return t`Big orders to check before shipping`;
    },
    load: checkBeforeShipping,
    get hint() {
      return t`Total > 150 or Quantity ≥ 10 (481 orders).`;
    },
  },
  {
    get label() {
      return t`Q4 2025 promos`;
    },
    get title() {
      return t`Q4 2025 promo orders, excluding Doohickeys`;
    },
    load: q4Promos,
    get hint() {
      return t`Created At in Oct–Dec 2025 and (Discount is not empty or User → Source is Affiliate) and not Product → Category = Doohickey. A stress test for summaries (86 orders).`;
    },
  },
];
