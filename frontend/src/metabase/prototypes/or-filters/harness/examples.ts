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
