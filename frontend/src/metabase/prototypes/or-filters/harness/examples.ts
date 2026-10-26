import * as Lib from "metabase-lib";

function findColumn(
  query: Lib.Query,
  stageIndex: number,
  displayName: string,
): Lib.ColumnMetadata | undefined {
  return Lib.filterableColumns(query, stageIndex).find(
    (column) =>
      Lib.displayInfo(query, stageIndex, column).displayName === displayName,
  );
}

/** Clears every filter on the stage. */
export function clearFilters(query: Lib.Query, stageIndex: number): Lib.Query {
  return Lib.filters(query, stageIndex).reduce(
    (nextQuery, filter) => Lib.removeClause(nextQuery, stageIndex, filter),
    query,
  );
}

/**
 * The ticket's example as one filter clause: `[Total] > 100 OR [Tax] > 2`.
 * This is what a custom expression produces today.
 */
export function withOrExample(query: Lib.Query, stageIndex: number): Lib.Query {
  const total = findColumn(query, stageIndex, "Total");
  const tax = findColumn(query, stageIndex, "Tax");
  if (!total || !tax) {
    return query;
  }
  const orClause = Lib.expressionClause("or", [
    Lib.numberFilterClause({ operator: ">", column: total, values: [100] }),
    Lib.numberFilterClause({ operator: ">", column: tax, values: [2] }),
  ]);
  return Lib.filter(clearFilters(query, stageIndex), stageIndex, orClause);
}

/**
 * A DNF example with two AND groups:
 * `([Total] > 100 AND [Quantity] > 3) OR ([Tax] > 2)`.
 */
export function withDnfExample(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const total = findColumn(query, stageIndex, "Total");
  const quantity = findColumn(query, stageIndex, "Quantity");
  const tax = findColumn(query, stageIndex, "Tax");
  if (!total || !quantity || !tax) {
    return query;
  }
  const orClause = Lib.expressionClause("or", [
    Lib.expressionClause("and", [
      Lib.numberFilterClause({ operator: ">", column: total, values: [100] }),
      Lib.numberFilterClause({ operator: ">", column: quantity, values: [3] }),
    ]),
    Lib.numberFilterClause({ operator: ">", column: tax, values: [2] }),
  ]);
  return Lib.filter(clearFilters(query, stageIndex), stageIndex, orClause);
}

/**
 * Two top-level pills: `[Total] > 100 OR [Tax] > 2` and `[Quantity] > 3`.
 */
export function withPillsExample(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const total = findColumn(query, stageIndex, "Total");
  const quantity = findColumn(query, stageIndex, "Quantity");
  const tax = findColumn(query, stageIndex, "Tax");
  if (!total || !quantity || !tax) {
    return query;
  }
  const orClause = Lib.expressionClause("or", [
    Lib.numberFilterClause({ operator: ">", column: total, values: [100] }),
    Lib.numberFilterClause({ operator: ">", column: tax, values: [2] }),
  ]);
  const quantityClause = Lib.numberFilterClause({
    operator: ">",
    column: quantity,
    values: [3],
  });
  const cleared = clearFilters(query, stageIndex);
  return Lib.filter(
    Lib.filter(cleared, stageIndex, orClause),
    stageIndex,
    quantityClause,
  );
}

/**
 * Three levels, as in the Option C Figma:
 * `[Total] > 100 AND [Quantity] > 3 AND ([Tax] > 2 OR ([Discount] is empty AND [Subtotal] < 50))`.
 */
export function withNestedExample(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const total = findColumn(query, stageIndex, "Total");
  const quantity = findColumn(query, stageIndex, "Quantity");
  const tax = findColumn(query, stageIndex, "Tax");
  const discount = findColumn(query, stageIndex, "Discount");
  const subtotal = findColumn(query, stageIndex, "Subtotal");
  if (!total || !quantity || !tax || !discount || !subtotal) {
    return query;
  }
  const subgroup = Lib.expressionClause("or", [
    Lib.numberFilterClause({ operator: ">", column: tax, values: [2] }),
    Lib.expressionClause("and", [
      Lib.defaultFilterClause({ operator: "is-null", column: discount }),
      Lib.numberFilterClause({ operator: "<", column: subtotal, values: [50] }),
    ]),
  ]);
  return [
    Lib.numberFilterClause({ operator: ">", column: total, values: [100] }),
    Lib.numberFilterClause({ operator: ">", column: quantity, values: [3] }),
    subgroup,
  ].reduce(
    (nextQuery, clause) => Lib.filter(nextQuery, stageIndex, clause),
    clearFilters(query, stageIndex),
  );
}

/**
 * Two full AND groups joined by OR:
 * `([Total] > 100 AND [Quantity] > 3) OR ([Tax] > 2 AND [Discount] > 5)`.
 */
export function withTwoGroupsExample(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const total = findColumn(query, stageIndex, "Total");
  const quantity = findColumn(query, stageIndex, "Quantity");
  const tax = findColumn(query, stageIndex, "Tax");
  const discount = findColumn(query, stageIndex, "Discount");
  if (!total || !quantity || !tax || !discount) {
    return query;
  }
  const orClause = Lib.expressionClause("or", [
    Lib.expressionClause("and", [
      Lib.numberFilterClause({ operator: ">", column: total, values: [100] }),
      Lib.numberFilterClause({ operator: ">", column: quantity, values: [3] }),
    ]),
    Lib.expressionClause("and", [
      Lib.numberFilterClause({ operator: ">", column: tax, values: [2] }),
      Lib.numberFilterClause({ operator: ">", column: discount, values: [5] }),
    ]),
  ]);
  return Lib.filter(clearFilters(query, stageIndex), stageIndex, orClause);
}

/**
 * Four levels in one pill, connectors alternating from OR:
 * `[Total] > 100 OR ([Tax] > 2 AND ([Discount] > 1 OR ([Subtotal] < 50 AND [Quantity] > 3)))`.
 */
export function withFourLevelsExample(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const total = findColumn(query, stageIndex, "Total");
  const tax = findColumn(query, stageIndex, "Tax");
  const discount = findColumn(query, stageIndex, "Discount");
  const subtotal = findColumn(query, stageIndex, "Subtotal");
  const quantity = findColumn(query, stageIndex, "Quantity");
  if (!total || !tax || !discount || !subtotal || !quantity) {
    return query;
  }
  const orClause = Lib.expressionClause("or", [
    Lib.numberFilterClause({ operator: ">", column: total, values: [100] }),
    Lib.expressionClause("and", [
      Lib.numberFilterClause({ operator: ">", column: tax, values: [2] }),
      Lib.expressionClause("or", [
        Lib.numberFilterClause({
          operator: ">",
          column: discount,
          values: [1],
        }),
        Lib.expressionClause("and", [
          Lib.numberFilterClause({
            operator: "<",
            column: subtotal,
            values: [50],
          }),
          Lib.numberFilterClause({
            operator: ">",
            column: quantity,
            values: [3],
          }),
        ]),
      ]),
    ]),
  ]);
  return Lib.filter(clearFilters(query, stageIndex), stageIndex, orClause);
}

/** Matches the long name, so an implicitly joined column reads `Product → Category`. */
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

/** `Count` by `Created At`, bucketed by `unit`, on a cleared query. */
function withCountByCreatedAt(
  query: Lib.Query,
  stageIndex: number,
  unit: string,
): Lib.Query | undefined {
  const cleared = clearFilters(query, stageIndex);
  const createdAt = findBreakoutColumn(cleared, stageIndex, "Created At");
  if (!createdAt) {
    return undefined;
  }
  const bucket = findTemporalBucket(cleared, stageIndex, createdAt, unit);
  return Lib.breakout(
    Lib.aggregateByCount(cleared, stageIndex),
    stageIndex,
    Lib.withTemporalBucket(createdAt, bucket),
  );
}

/**
 * An aggregated question: `Count` by `Product → Category` by `Created At: Month`.
 * This is the shape where the "See these Orders" and "zoom in" drills appear;
 * a raw table only offers the per-cell quick filters.
 */
export function withCountByCategoryByMonth(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const byMonth = withCountByCreatedAt(query, stageIndex, "month");
  const category = byMonth
    ? findBreakoutColumn(byMonth, stageIndex, "Product → Category")
    : undefined;
  if (!byMonth || !category) {
    return query;
  }
  return Lib.breakout(byMonth, stageIndex, category);
}

/**
 * Drill starting points. Each one is the unfiltered query shape on which a
 * drill from `drills.md` appears in the click popover; the drill itself is
 * performed in the results, so the bar shows exactly what it writes.
 */

/** Orders as a table: quick-filter on a value cell, fk-filter on Product ID / User ID, column-filter on a header. */
export function withRawRows(query: Lib.Query, stageIndex: number): Lib.Query {
  return clearFilters(query, stageIndex);
}

/** `Count` by `Product → Category`: "See these Orders" writes `Category = X`; "Break out by…" offers category and time. */
export function withCountByCategory(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  return withCountByBreakout(query, stageIndex, "Product → Category");
}

/** `Count` by `Created At: Month`: zoom-in.timeseries filters the clicked month and breaks out by week. */
export function withCountByMonth(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  return withCountByCreatedAt(query, stageIndex, "month") ?? query;
}

/** `Count` by `Total` in auto bins: zoom-in.binning writes `Total >= a and Total < b` and narrows the bins. */
export function withCountByBinnedTotal(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const cleared = clearFilters(query, stageIndex);
  const total = findBreakoutColumn(cleared, stageIndex, "Total");
  if (!total) {
    return query;
  }
  return Lib.breakout(
    Lib.aggregateByCount(cleared, stageIndex),
    stageIndex,
    Lib.withDefaultBinning(cleared, stageIndex, total),
  );
}

/** `Count` by `User → State`: zoom-in.geographic writes `State = X` and swaps the breakout to binned lat/lon. */
export function withCountByState(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  return withCountByBreakout(query, stageIndex, "User → State");
}

/** `Count` by `User → Source`: "Break out by…" writes `Source = X` and breaks out by the chosen column. */
export function withCountBySource(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  return withCountByBreakout(query, stageIndex, "User → Source");
}

/**
 * `Count where Discount is not empty` by `Product → Category`: "See these
 * Orders" appends two clauses, the breakout value and the aggregation's own
 * condition.
 */
export function withCountWhereByCategory(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const cleared = clearFilters(query, stageIndex);
  const discount = findColumn(cleared, stageIndex, "Discount");
  const category = findBreakoutColumn(
    cleared,
    stageIndex,
    "Product → Category",
  );
  if (!discount || !category) {
    return query;
  }
  const countWhere = Lib.expressionClause("count-where", [
    Lib.defaultFilterClause({ operator: "not-null", column: discount }),
  ]);
  return Lib.breakout(
    Lib.aggregate(cleared, stageIndex, countWhere),
    stageIndex,
    category,
  );
}

function withCountByBreakout(
  query: Lib.Query,
  stageIndex: number,
  longDisplayName: string,
): Lib.Query {
  const cleared = clearFilters(query, stageIndex);
  const column = findBreakoutColumn(cleared, stageIndex, longDisplayName);
  if (!column) {
    return query;
  }
  return Lib.breakout(
    Lib.aggregateByCount(cleared, stageIndex),
    stageIndex,
    column,
  );
}

/**
 * The aggregated chart with the ticket's OR already applied, so one drill
 * shows the existing expression being wrapped in parentheses and AND-ed.
 */
export function withFilteredCountByCategoryByMonth(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  return withOrExample(
    withCountByCategoryByMonth(query, stageIndex),
    stageIndex,
  );
}

function findFilterColumnByLongName(
  query: Lib.Query,
  stageIndex: number,
  longDisplayName: string,
): Lib.ColumnMetadata | undefined {
  return Lib.filterableColumns(query, stageIndex).find(
    (column) =>
      Lib.displayInfo(query, stageIndex, column).longDisplayName ===
      longDisplayName,
  );
}

/**
 * Filters on both stages, long enough to wrap:
 * rows `([Total] > 100 OR [Tax] > 2) AND [Quantity] > 3 AND [Discount] is empty`,
 * then on the summary `[Count] > 50 AND ([Category] = Gadget OR [Category] = Gizmo)`.
 */
export function withTwoStagesExample(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const aggregated = withCountByCategoryByMonth(query, stageIndex);
  const total = findColumn(aggregated, stageIndex, "Total");
  const tax = findColumn(aggregated, stageIndex, "Tax");
  const quantity = findColumn(aggregated, stageIndex, "Quantity");
  const discount = findColumn(aggregated, stageIndex, "Discount");
  if (!total || !tax || !quantity || !discount) {
    return query;
  }
  const rowsFiltered = [
    Lib.expressionClause("or", [
      Lib.numberFilterClause({ operator: ">", column: total, values: [100] }),
      Lib.numberFilterClause({ operator: ">", column: tax, values: [2] }),
    ]),
    Lib.numberFilterClause({ operator: ">", column: quantity, values: [3] }),
    Lib.defaultFilterClause({ operator: "is-null", column: discount }),
  ].reduce(
    (nextQuery, clause) => Lib.filter(nextQuery, stageIndex, clause),
    aggregated,
  );

  const summaryStageIndex = stageIndex + 1;
  const withSummaryStage = Lib.appendStage(rowsFiltered);
  const count = findFilterColumnByLongName(
    withSummaryStage,
    summaryStageIndex,
    "Count",
  );
  const category = findFilterColumnByLongName(
    withSummaryStage,
    summaryStageIndex,
    "Product → Category",
  );
  if (!count || !category) {
    return rowsFiltered;
  }
  const categoryIs = (value: string) =>
    Lib.stringFilterClause({
      operator: "=",
      column: category,
      values: [value],
      options: {},
    });
  return [
    Lib.numberFilterClause({ operator: ">", column: count, values: [50] }),
    Lib.expressionClause("or", [categoryIs("Gadget"), categoryIs("Gizmo")]),
  ].reduce(
    (nextQuery, clause) => Lib.filter(nextQuery, summaryStageIndex, clause),
    withSummaryStage,
  );
}

/**
 * The states the drills above produce, built directly so they load without a
 * click. Clause shapes follow what each drill writes (`drills.md`).
 */

function stringEquals(column: Lib.ColumnMetadata, value: string) {
  return Lib.stringFilterClause({
    operator: "=",
    column,
    values: [value],
    options: {},
  });
}

/** fk-filter on a Product ID cell: `Product ID = 14`. */
export function withFkFilterDrilled(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const cleared = clearFilters(query, stageIndex);
  const productId = findColumn(cleared, stageIndex, "Product ID");
  if (!productId) {
    return query;
  }
  return Lib.filter(
    cleared,
    stageIndex,
    Lib.numberFilterClause({ operator: "=", column: productId, values: [14] }),
  );
}

/** underlying-records on the Gizmo bar: back to rows, `Category = Gizmo`. */
export function withUnderlyingRecordsDrilled(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const cleared = clearFilters(query, stageIndex);
  const category = findFilterColumnByLongName(
    cleared,
    stageIndex,
    "Product → Category",
  );
  if (!category) {
    return query;
  }
  return Lib.filter(cleared, stageIndex, stringEquals(category, "Gizmo"));
}

/** underlying-records on a count-where bar: the breakout value plus the aggregation's condition. */
export function withCountWhereDrilled(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const cleared = clearFilters(query, stageIndex);
  const category = findFilterColumnByLongName(
    cleared,
    stageIndex,
    "Product → Category",
  );
  const discount = findColumn(cleared, stageIndex, "Discount");
  if (!category || !discount) {
    return query;
  }
  return [
    stringEquals(category, "Doohickey"),
    Lib.defaultFilterClause({ operator: "not-null", column: discount }),
  ].reduce(
    (nextQuery, clause) => Lib.filter(nextQuery, stageIndex, clause),
    cleared,
  );
}

/** zoom-in.timeseries on July 2027: month-bucketed `=` filter, breakout by week. */
export function withZoomTimeDrilled(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const byWeek = withCountByCreatedAt(query, stageIndex, "week");
  const createdAt = byWeek
    ? findColumn(byWeek, stageIndex, "Created At")
    : undefined;
  if (!byWeek || !createdAt) {
    return query;
  }
  const month = findTemporalBucket(byWeek, stageIndex, createdAt, "month");
  return Lib.filter(
    byWeek,
    stageIndex,
    Lib.specificDateFilterClause({
      operator: "=",
      column: Lib.withTemporalBucket(createdAt, month),
      values: [new Date(2027, 6, 1)],
      hasTime: false,
    }),
  );
}

/** zoom-in.binning on the 40–60 bar: `>=` / `<` range on the binned column, bins narrowed. */
export function withZoomBinsDrilled(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const binned = withCountByBinnedTotal(query, stageIndex);
  const total = findColumn(binned, stageIndex, "Total");
  if (!total) {
    return query;
  }
  const binnedTotal = Lib.withDefaultBinning(binned, stageIndex, total);
  return [
    Lib.numberFilterClause({
      operator: ">=",
      column: binnedTotal,
      values: [40],
    }),
    Lib.numberFilterClause({
      operator: "<",
      column: binnedTotal,
      values: [60],
    }),
  ].reduce(
    (nextQuery, clause) => Lib.filter(nextQuery, stageIndex, clause),
    binned,
  );
}

/** zoom-in.geographic on Texas: `State = TX`, breakout swapped to lat/lon binned every 1°. */
export function withZoomMapDrilled(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const cleared = clearFilters(query, stageIndex);
  const state = findFilterColumnByLongName(cleared, stageIndex, "User → State");
  const latitude = findBreakoutColumn(cleared, stageIndex, "User → Latitude");
  const longitude = findBreakoutColumn(cleared, stageIndex, "User → Longitude");
  if (!state || !latitude || !longitude) {
    return query;
  }
  const oneDegree = (column: Lib.ColumnMetadata) =>
    Lib.withBinning(
      column,
      Lib.availableBinningStrategies(cleared, stageIndex, column).find(
        (bucket) =>
          Lib.displayInfo(cleared, stageIndex, bucket).displayName ===
          "Bin every 1 degree",
      ) ?? null,
    );
  const filtered = Lib.filter(
    Lib.aggregateByCount(cleared, stageIndex),
    stageIndex,
    stringEquals(state, "TX"),
  );
  return Lib.breakout(
    Lib.breakout(filtered, stageIndex, oneDegree(latitude)),
    stageIndex,
    oneDegree(longitude),
  );
}

/** pivot on the Affiliate bar by Category: `Source = Affiliate`, breakout swapped to Category. */
export function withPivotDrilled(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const byCategory = withCountByCategory(query, stageIndex);
  const source = findFilterColumnByLongName(
    byCategory,
    stageIndex,
    "User → Source",
  );
  if (!source) {
    return query;
  }
  return Lib.filter(byCategory, stageIndex, stringEquals(source, "Affiliate"));
}

/** quick-filter on the Gadget Count cell: `Count > 4939` on the stage after the summary. */
export function withCountFilterDrilled(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const byCategory = withCountByCategory(query, stageIndex);
  const summaryStageIndex = stageIndex + 1;
  const withSummaryStage = Lib.appendStage(byCategory);
  const count = findFilterColumnByLongName(
    withSummaryStage,
    summaryStageIndex,
    "Count",
  );
  if (!count) {
    return byCategory;
  }
  return Lib.filter(
    withSummaryStage,
    summaryStageIndex,
    Lib.numberFilterClause({ operator: ">", column: count, values: [4939] }),
  );
}

function findAggregationOperator(
  query: Lib.Query,
  stageIndex: number,
  shortName: string,
): Lib.AggregationOperator | undefined {
  return Lib.availableAggregationOperators(query, stageIndex).find(
    (operator) =>
      Lib.displayInfo(query, stageIndex, operator).shortName === shortName,
  );
}

function findOperatorColumn(
  query: Lib.Query,
  stageIndex: number,
  operator: Lib.AggregationOperator,
  displayName: string,
): Lib.ColumnMetadata | undefined {
  return Lib.aggregationOperatorColumns(operator).find(
    (column) =>
      Lib.displayInfo(query, stageIndex, column).displayName === displayName,
  );
}

/**
 * Two levels of summarization, filters on every stage. Stage 0: `Total > 100`,
 * `Sum of Total` by `Created At: Day` (daily revenue). Stage 1:
 * `Sum of Total > 500`, then `Average of Sum of Total` by `Created At: Month`
 * (the day re-bucketed to months). Stage 2: `Average of Sum of Total > 700`.
 *
 * An aggregation's output cannot be binned (no fingerprint, the backend
 * refuses), so the second summary buckets the date instead.
 */
export function withTwoSummariesExample(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const cleared = clearFilters(query, stageIndex);
  const total = findColumn(cleared, stageIndex, "Total");
  const createdAt = findBreakoutColumn(cleared, stageIndex, "Created At");
  const sum = findAggregationOperator(cleared, stageIndex, "sum");
  const sumTotal = sum
    ? findOperatorColumn(cleared, stageIndex, sum, "Total")
    : undefined;
  if (!total || !createdAt || !sum || !sumTotal) {
    return query;
  }
  const rowsFiltered = Lib.filter(
    cleared,
    stageIndex,
    Lib.numberFilterClause({ operator: ">", column: total, values: [100] }),
  );
  const daily = Lib.breakout(
    Lib.aggregate(
      rowsFiltered,
      stageIndex,
      Lib.aggregationClause(sum, sumTotal),
    ),
    stageIndex,
    Lib.withTemporalBucket(
      createdAt,
      findTemporalBucket(rowsFiltered, stageIndex, createdAt, "day"),
    ),
  );

  const secondStageIndex = stageIndex + 1;
  const withSecondStage = Lib.appendStage(daily);
  const dailySum = findFilterColumnByLongName(
    withSecondStage,
    secondStageIndex,
    "Sum of Total",
  );
  const day = findBreakoutColumn(
    withSecondStage,
    secondStageIndex,
    "Created At: Day",
  );
  const avg = findAggregationOperator(withSecondStage, secondStageIndex, "avg");
  const avgDailySum = avg
    ? findOperatorColumn(withSecondStage, secondStageIndex, avg, "Sum of Total")
    : undefined;
  if (!dailySum || !day || !avg || !avgDailySum) {
    return daily;
  }
  const secondFiltered = Lib.filter(
    withSecondStage,
    secondStageIndex,
    Lib.numberFilterClause({ operator: ">", column: dailySum, values: [500] }),
  );
  const monthly = Lib.breakout(
    Lib.aggregate(
      secondFiltered,
      secondStageIndex,
      Lib.aggregationClause(avg, avgDailySum),
    ),
    secondStageIndex,
    Lib.withTemporalBucket(
      day,
      findTemporalBucket(secondFiltered, secondStageIndex, day, "month"),
    ),
  );

  const thirdStageIndex = secondStageIndex + 1;
  const withThirdStage = Lib.appendStage(monthly);
  const monthlyAverage = Lib.filterableColumns(
    withThirdStage,
    thirdStageIndex,
  ).find(
    (column) =>
      Lib.displayInfo(withThirdStage, thirdStageIndex, column).name === "avg",
  );
  if (!monthlyAverage) {
    return monthly;
  }
  return Lib.filter(
    withThirdStage,
    thirdStageIndex,
    Lib.numberFilterClause({
      operator: ">",
      column: monthlyAverage,
      values: [700],
    }),
  );
}
