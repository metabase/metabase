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

/**
 * An aggregated question: `Count` by `Product → Category` by `Created At: Month`.
 * This is the shape where the "See these Orders" and "zoom in" drills appear;
 * a raw table only offers the per-cell quick filters.
 */
export function withCountByCategoryByMonth(
  query: Lib.Query,
  stageIndex: number,
): Lib.Query {
  const cleared = clearFilters(query, stageIndex);
  const category = findBreakoutColumn(
    cleared,
    stageIndex,
    "Product → Category",
  );
  const createdAt = findBreakoutColumn(cleared, stageIndex, "Created At");
  if (!category || !createdAt) {
    return query;
  }
  const monthBucket = Lib.availableTemporalBuckets(
    cleared,
    stageIndex,
    createdAt,
  ).find(
    (bucket) =>
      Lib.displayInfo(cleared, stageIndex, bucket).shortName === "month",
  );
  const counted = Lib.aggregateByCount(cleared, stageIndex);
  const byCategory = Lib.breakout(counted, stageIndex, category);
  return Lib.breakout(
    byCategory,
    stageIndex,
    Lib.withTemporalBucket(createdAt, monthBucket ?? null),
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
