import { t } from "ttag";
import _ from "underscore";

import * as Lib from "metabase-lib";
import type { PivotTableColumnSplitSetting } from "metabase-types/api";

import type {
  SummaryBase,
  SummaryDefinition,
  SummaryDimension,
  SummaryDimensionWellId,
  SummaryDragItem,
  SummaryExpression,
  SummaryValue,
  SummaryWellId,
} from "./types";

const DEFAULT_FORMULA_NAME_MAX_LENGTH = 40;

export function getSummaryBase(dataQuery: Lib.Query): SummaryBase {
  const stageIndex = -1;
  const isAggregated =
    Lib.aggregations(dataQuery, stageIndex).length > 0 ||
    Lib.breakouts(dataQuery, stageIndex).length > 0;
  if (isAggregated) {
    return { query: Lib.appendStage(dataQuery), stageIndex };
  }

  // sorting, limits, and hidden columns only make sense for raw rows; keep filters and joins
  const withoutOrderBys = Lib.removeOrderBys(dataQuery, stageIndex);
  const withoutLimit = Lib.limit(withoutOrderBys, stageIndex, null);
  return {
    query: Lib.withFields(withoutLimit, stageIndex, []),
    stageIndex,
  };
}

export function getItemKey(
  { query, stageIndex }: SummaryBase,
  item: Lib.ColumnMetadata | Lib.MetricMetadata,
): string {
  return JSON.stringify(Lib.legacyRef(query, stageIndex, item));
}

export function getColumnLabel(
  { query, stageIndex }: SummaryBase,
  column: Lib.ColumnMetadata,
): string {
  return Lib.displayInfo(query, stageIndex, column).displayName;
}

export function getMetricLabel(
  { query, stageIndex }: SummaryBase,
  metric: Lib.MetricMetadata,
): string {
  return Lib.displayInfo(query, stageIndex, metric).displayName;
}

export type SummaryColumnSection = {
  name: string;
  columns: Lib.ColumnMetadata[];
};

export function getColumnSections(
  base: SummaryBase,
  searchText: string,
): SummaryColumnSection[] {
  const { query, stageIndex } = base;
  const normalizedSearchText = searchText.trim().toLowerCase();
  const columns = Lib.breakoutableColumns(query, stageIndex).filter(
    (column) =>
      normalizedSearchText.length === 0 ||
      getColumnLabel(base, column).toLowerCase().includes(normalizedSearchText),
  );

  return Lib.groupColumns(columns).map((group) => ({
    name: Lib.displayInfo(query, stageIndex, group).displayName,
    columns: Lib.getColumnsFromColumnGroup(group),
  }));
}

export function getAvailableMetrics(
  base: SummaryBase,
  searchText: string,
): Lib.MetricMetadata[] {
  const normalizedSearchText = searchText.trim().toLowerCase();
  return Lib.availableMetrics(base.query, base.stageIndex).filter(
    (metric) =>
      normalizedSearchText.length === 0 ||
      getMetricLabel(base, metric).toLowerCase().includes(normalizedSearchText),
  );
}

function findOperator(
  { query, stageIndex }: SummaryBase,
  shortName: string,
): Lib.AggregationOperator | undefined {
  return Lib.availableAggregationOperators(query, stageIndex).find(
    (operator) =>
      Lib.displayInfo(query, stageIndex, operator).shortName === shortName,
  );
}

function findOperatorColumn(
  base: SummaryBase,
  operator: Lib.AggregationOperator,
  column: Lib.ColumnMetadata,
): Lib.ColumnMetadata | null {
  return Lib.findMatchingColumn(
    base.query,
    base.stageIndex,
    column,
    Lib.aggregationOperatorColumns(operator),
  );
}

export type SummaryOperatorOption = {
  shortName: string;
  displayName: string;
};

/** Aggregation operators that can be applied to `column`, e.g. "Sum of ..." for numbers. */
export function getColumnOperatorOptions(
  base: SummaryBase,
  column: Lib.ColumnMetadata,
): SummaryOperatorOption[] {
  const { query, stageIndex } = base;
  return Lib.availableAggregationOperators(query, stageIndex)
    .map((operator) => ({
      operator,
      info: Lib.displayInfo(query, stageIndex, operator),
    }))
    .filter(
      ({ operator, info }) =>
        info.requiresColumn &&
        findOperatorColumn(base, operator, column) != null,
    )
    .map(({ info }) => ({
      shortName: info.shortName,
      displayName: info.displayName,
    }));
}

function getDefaultOperatorShortName(
  base: SummaryBase,
  column: Lib.ColumnMetadata,
): string | null {
  const shortNames = getColumnOperatorOptions(base, column).map(
    (option) => option.shortName,
  );
  return (
    ["sum", "distinct"].find((shortName) => shortNames.includes(shortName)) ??
    shortNames[0] ??
    null
  );
}

type SummaryOperatorValue = Extract<SummaryValue, { type: "count" | "column" }>;

/** The aggregation a count or column value stands for, e.g. `Sum([Total])`. */
function getOperatorClause(
  base: SummaryBase,
  value: SummaryOperatorValue,
): Lib.AggregationClause | null {
  if (value.type === "count") {
    const operator = findOperator(base, "count");
    return operator ? Lib.aggregationClause(operator) : null;
  }
  const operator = findOperator(base, value.operatorShortName);
  const column = operator
    ? findOperatorColumn(base, operator, value.column)
    : null;
  return operator && column ? Lib.aggregationClause(operator, column) : null;
}

function getAggregable(
  base: SummaryBase,
  value: SummaryValue,
): Lib.Aggregable | null {
  switch (value.type) {
    case "count":
    case "column":
      return getOperatorClause(base, value);
    case "metric": {
      const metricKey = getItemKey(base, value.metric);
      return (
        Lib.availableMetrics(base.query, base.stageIndex).find(
          (metric) => getItemKey(base, metric) === metricKey,
        ) ?? null
      );
    }
    case "expression":
      return Lib.withExpressionName(
        value.expression.clause,
        value.expression.name,
      );
  }
}

function getUniqueName(name: string, usedNames: Set<string>): string {
  let uniqueName = name;
  for (let index = 2; usedNames.has(uniqueName.toLowerCase()); index++) {
    uniqueName = `${name} (${index})`;
  }
  usedNames.add(uniqueName.toLowerCase());
  return uniqueName;
}

/**
 * The names custom-column dimensions are added to the stage under, keyed by item id: their own
 * names, made unique against each other and the stage's existing custom columns.
 */
function getDimensionExpressionNames(
  { query, stageIndex }: SummaryBase,
  dimensions: SummaryDimension[],
): Map<string, string> {
  const usedNames = new Set(
    Lib.expressions(query, stageIndex).map((expression) =>
      Lib.displayInfo(query, stageIndex, expression).displayName.toLowerCase(),
    ),
  );
  const names = new Map<string, string>();
  dimensions.forEach((dimension) => {
    if ("expression" in dimension) {
      names.set(
        dimension.id,
        getUniqueName(dimension.expression.name, usedNames),
      );
    }
  });
  return names;
}

export function findExpressionColumn(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
  expressionName: string,
): Lib.ColumnMetadata | null {
  return (
    columns.find((column) => {
      const info = Lib.displayInfo(query, stageIndex, column);
      return info.isCalculated && info.displayName === expressionName;
    }) ?? null
  );
}

/**
 * Builds the summary query: rows then columns as breakouts, values as aggregations, in well order.
 * Custom-column dimensions are added to the stage as expressions first, so they can be grouped by.
 * Returns `null` when an item no longer resolves against the base query (e.g. a removed join).
 */
export function buildSummaryQuery(
  base: SummaryBase,
  definition: SummaryDefinition,
): Lib.Query | null {
  const { stageIndex } = base;
  const dimensions = [...definition.rows, ...definition.columns];
  const expressionNames = getDimensionExpressionNames(base, dimensions);
  let query = base.query;

  for (const dimension of dimensions) {
    const expressionName = expressionNames.get(dimension.id);
    if ("expression" in dimension && expressionName != null) {
      query = Lib.expression(
        query,
        stageIndex,
        expressionName,
        dimension.expression.clause,
      );
    }
  }

  const breakoutableColumns = Lib.breakoutableColumns(query, stageIndex);
  for (const dimension of dimensions) {
    const expressionName = expressionNames.get(dimension.id);
    const column =
      "expression" in dimension
        ? findExpressionColumn(
            query,
            stageIndex,
            breakoutableColumns,
            expressionName ?? dimension.expression.name,
          )
        : Lib.findMatchingColumn(
            query,
            stageIndex,
            dimension.column,
            breakoutableColumns,
          );
    if (column == null) {
      return null;
    }
    query = Lib.breakout(
      query,
      stageIndex,
      Lib.withDefaultBucket(query, stageIndex, column),
    );
  }

  for (const value of definition.values) {
    const aggregable = getAggregable(base, value);
    if (aggregable == null) {
      return null;
    }
    query = Lib.aggregate(query, stageIndex, aggregable);
  }

  return query;
}

function getFallbackValueLabel(base: SummaryBase, value: SummaryValue) {
  switch (value.type) {
    case "count":
      return t`Count of rows`;
    case "column":
      return getColumnLabel(base, value.column);
    case "metric":
      return getMetricLabel(base, value.metric);
    case "expression":
      return value.expression.name;
  }
}

function getFallbackDimensionLabel(
  base: SummaryBase,
  dimension: SummaryDimension,
) {
  return "expression" in dimension
    ? dimension.expression.name
    : getColumnLabel(base, dimension.column);
}

/**
 * Chip labels keyed by item id. Labels come from the built summary query when it resolves, so
 * they include default buckets ("Created At: Month") and aggregation names ("Sum of Total").
 */
export function getItemLabels(
  base: SummaryBase,
  definition: SummaryDefinition,
  summaryQuery: Lib.Query | null,
): Map<string, string> {
  const { stageIndex } = base;
  const breakoutLabels = summaryQuery
    ? Lib.breakouts(summaryQuery, stageIndex).map(
        (breakout) =>
          Lib.displayInfo(summaryQuery, stageIndex, breakout).displayName,
      )
    : [];
  const aggregationLabels = summaryQuery
    ? Lib.aggregations(summaryQuery, stageIndex).map(
        (aggregation) =>
          Lib.displayInfo(summaryQuery, stageIndex, aggregation).displayName,
      )
    : [];

  const labels = new Map<string, string>();
  [...definition.rows, ...definition.columns].forEach((dimension, index) => {
    labels.set(
      dimension.id,
      breakoutLabels[index] ?? getFallbackDimensionLabel(base, dimension),
    );
  });
  definition.values.forEach((value, index) => {
    labels.set(
      value.id,
      aggregationLabels[index] ?? getFallbackValueLabel(base, value),
    );
  });
  return labels;
}

/** The names of the summary query's value columns, in the order of `definition.values`. */
export function getValueColumnNames(
  summaryQuery: Lib.Query,
  stageIndex: number,
): string[] {
  return Lib.returnedColumns(summaryQuery, stageIndex)
    .map((column) => Lib.displayInfo(summaryQuery, stageIndex, column))
    .filter((info) => info.isAggregation)
    .map((info) => info.name);
}

export type SummaryPivotConfig = {
  columnSplit: PivotTableColumnSplitSetting;
  pivotRows: number[];
  pivotCols: number[];
};

export function getPivotConfig(
  summaryQuery: Lib.Query,
  stageIndex: number,
  definition: SummaryDefinition,
): SummaryPivotConfig {
  const columnInfos = Lib.returnedColumns(summaryQuery, stageIndex).map(
    (column) => Lib.displayInfo(summaryQuery, stageIndex, column),
  );
  const breakoutNames = columnInfos
    .filter((info) => info.isBreakout)
    .map((info) => info.name);
  const rowCount = definition.rows.length;
  const dimensionCount = rowCount + definition.columns.length;

  return {
    columnSplit: {
      rows: breakoutNames.slice(0, rowCount),
      columns: breakoutNames.slice(rowCount, dimensionCount),
      values: getValueColumnNames(summaryQuery, stageIndex),
    },
    pivotRows: _.range(0, rowCount),
    pivotCols: _.range(rowCount, dimensionCount),
  };
}

export function canDropOnWell(
  item: SummaryDragItem,
  wellId: SummaryWellId,
  definition: SummaryDefinition,
): boolean {
  switch (item.kind) {
    case "column":
      return true;
    case "metric":
      return wellId === "values";
    case "chip": {
      if (item.wellId === wellId) {
        return false;
      }
      // custom columns group but can't be aggregated, and custom aggregations can't group
      const dimension = findDimension(definition, item.itemId);
      if (dimension != null) {
        return wellId !== "values" || "column" in dimension;
      }
      if (wellId === "values") {
        return true;
      }
      const value = definition.values.find(({ id }) => id === item.itemId);
      return value == null || value.type === "column";
    }
  }
}

export function createItemId() {
  return _.uniqueId("summary-item-");
}

export function findDimension(
  definition: SummaryDefinition,
  itemId: string,
): SummaryDimension | null {
  return (
    [...definition.rows, ...definition.columns].find(
      ({ id }) => id === itemId,
    ) ?? null
  );
}

function withoutDimensionColumn(
  base: SummaryBase,
  definition: SummaryDefinition,
  column: Lib.ColumnMetadata,
): SummaryDefinition {
  const columnKey = getItemKey(base, column);
  const isOtherColumn = (dimension: SummaryDimension) =>
    !("column" in dimension) ||
    getItemKey(base, dimension.column) !== columnKey;
  return {
    ...definition,
    rows: definition.rows.filter(isOtherColumn),
    columns: definition.columns.filter(isOtherColumn),
  };
}

function addDimension(
  base: SummaryBase,
  definition: SummaryDefinition,
  wellId: SummaryDimensionWellId,
  column: Lib.ColumnMetadata,
): SummaryDefinition {
  // a column can only group the pivot once, so dropping it moves it
  const nextDefinition = withoutDimensionColumn(base, definition, column);
  return {
    ...nextDefinition,
    [wellId]: [...nextDefinition[wellId], { id: createItemId(), column }],
  };
}

function addColumnValue(
  base: SummaryBase,
  definition: SummaryDefinition,
  column: Lib.ColumnMetadata,
): SummaryDefinition {
  const operatorShortName = getDefaultOperatorShortName(base, column);
  if (operatorShortName == null) {
    return definition;
  }
  return {
    ...definition,
    values: [
      ...definition.values,
      { id: createItemId(), type: "column", column, operatorShortName },
    ],
  };
}

export function addMetricValue(
  base: SummaryBase,
  definition: SummaryDefinition,
  metric: Lib.MetricMetadata,
): SummaryDefinition {
  const metricKey = getItemKey(base, metric);
  const hasMetric = definition.values.some(
    (value) =>
      value.type === "metric" && getItemKey(base, value.metric) === metricKey,
  );
  if (hasMetric) {
    return definition;
  }
  return {
    ...definition,
    values: [
      ...definition.values,
      { id: createItemId(), type: "metric", metric },
    ],
  };
}

export function addCountValue(
  definition: SummaryDefinition,
): SummaryDefinition {
  if (definition.values.some((value) => value.type === "count")) {
    return definition;
  }
  return {
    ...definition,
    values: [...definition.values, { id: createItemId(), type: "count" }],
  };
}

export function addExpressionDimension(
  definition: SummaryDefinition,
  wellId: SummaryDimensionWellId,
  expression: SummaryExpression,
): SummaryDefinition {
  return {
    ...definition,
    [wellId]: [...definition[wellId], { id: createItemId(), expression }],
  };
}

export function addExpressionValue(
  definition: SummaryDefinition,
  expression: SummaryExpression,
): SummaryDefinition {
  return {
    ...definition,
    values: [
      ...definition.values,
      { id: createItemId(), type: "expression", expression },
    ],
  };
}

/** Replaces the item `itemId` with a custom expression, in place, e.g. after editing it as a formula. */
export function replaceWithExpression(
  definition: SummaryDefinition,
  itemId: string,
  expression: SummaryExpression,
): SummaryDefinition {
  const replaceDimension = (dimension: SummaryDimension): SummaryDimension =>
    dimension.id === itemId ? { id: itemId, expression } : dimension;
  return {
    ...definition,
    rows: definition.rows.map(replaceDimension),
    columns: definition.columns.map(replaceDimension),
    values: definition.values.map((value) =>
      value.id === itemId
        ? { id: itemId, type: "expression", expression }
        : value,
    ),
  };
}

/**
 * The clause an item's formula is written from when editing it: the expression itself, or the
 * aggregation a count or column value stands for. `null` for items that aren't formulas (metrics, columns).
 */
export function getFormulaClause(
  base: SummaryBase,
  definition: SummaryDefinition,
  itemId: string,
): Lib.Expressionable | null {
  const dimension = findDimension(definition, itemId);
  if (dimension != null) {
    return "expression" in dimension ? dimension.expression.clause : null;
  }
  const value = definition.values.find(({ id }) => id === itemId);
  if (value == null || value.type === "metric") {
    return null;
  }
  return value.type === "expression"
    ? value.expression.clause
    : getOperatorClause(base, value);
}

/** "Sum(Total) / Count": the name a formula's result gets when nobody names it. */
export function getDefaultFormulaName(source: string): string {
  const name = source
    .replace(/\[([^\]]*)\]?/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return name.length > DEFAULT_FORMULA_NAME_MAX_LENGTH
    ? `${name.slice(0, DEFAULT_FORMULA_NAME_MAX_LENGTH - 1).trimEnd()}…`
    : name;
}

export function removeItem(
  definition: SummaryDefinition,
  itemId: string,
): SummaryDefinition {
  return {
    ...definition,
    rows: definition.rows.filter(({ id }) => id !== itemId),
    columns: definition.columns.filter(({ id }) => id !== itemId),
    values: definition.values.filter(({ id }) => id !== itemId),
  };
}

/** Turns the summary into a pivot table, keeping its groupings as rows. */
export function pivotSummary(definition: SummaryDefinition): SummaryDefinition {
  return { ...definition, isPivot: true };
}

/** Turns a pivot back into a plain summary, grouping by its column groupings after its row groupings. */
export function unpivotSummary(
  definition: SummaryDefinition,
): SummaryDefinition {
  return {
    ...definition,
    rows: [...definition.rows, ...definition.columns],
    columns: [],
    isPivot: false,
  };
}

/** Transposes the pivot: what grouped rows splits columns, and the other way around. */
export function swapRowsAndColumns(
  definition: SummaryDefinition,
): SummaryDefinition {
  return {
    ...definition,
    rows: definition.columns,
    columns: definition.rows,
  };
}

export function changeValueOperator(
  definition: SummaryDefinition,
  itemId: string,
  operatorShortName: string,
): SummaryDefinition {
  return {
    ...definition,
    values: definition.values.map((value) =>
      value.id === itemId && value.type === "column"
        ? { ...value, operatorShortName }
        : value,
    ),
  };
}

function findChipColumn(
  definition: SummaryDefinition,
  itemId: string,
): Lib.ColumnMetadata | null {
  const dimension = findDimension(definition, itemId);
  if (dimension) {
    return "column" in dimension ? dimension.column : null;
  }
  const value = definition.values.find(({ id }) => id === itemId);
  return value?.type === "column" ? value.column : null;
}

/**
 * Applies a drag-and-drop of `item` onto `wellId`; returns the definition unchanged for unsupported drops.
 * Dropping on Columns makes the summary a pivot.
 */
export function dropOnWell(
  base: SummaryBase,
  definition: SummaryDefinition,
  item: SummaryDragItem,
  wellId: SummaryWellId,
): SummaryDefinition {
  const nextDefinition = applyDrop(base, definition, item, wellId);
  return wellId === "columns" && nextDefinition !== definition
    ? pivotSummary(nextDefinition)
    : nextDefinition;
}

function applyDrop(
  base: SummaryBase,
  definition: SummaryDefinition,
  item: SummaryDragItem,
  wellId: SummaryWellId,
): SummaryDefinition {
  if (!canDropOnWell(item, wellId, definition)) {
    return definition;
  }

  switch (item.kind) {
    case "column":
      return wellId === "values"
        ? addColumnValue(base, definition, item.column)
        : addDimension(base, definition, wellId, item.column);
    case "metric":
      return addMetricValue(base, definition, item.metric);
    case "chip": {
      const dimension = findDimension(definition, item.itemId);
      if (dimension != null && "expression" in dimension) {
        // custom columns move as they are, keeping their formula
        if (wellId === "values") {
          return definition;
        }
        const remainingDefinition = removeItem(definition, item.itemId);
        return {
          ...remainingDefinition,
          [wellId]: [...remainingDefinition[wellId], dimension],
        };
      }
      const column = findChipColumn(definition, item.itemId);
      if (column == null) {
        return definition;
      }
      const remainingDefinition = removeItem(definition, item.itemId);
      return wellId === "values"
        ? addColumnValue(base, remainingDefinition, column)
        : addDimension(base, remainingDefinition, wellId, column);
    }
  }
}

export function isSummaryDragItem(value: unknown): value is SummaryDragItem {
  return (
    typeof value === "object" &&
    value != null &&
    "kind" in value &&
    (value.kind === "column" ||
      value.kind === "metric" ||
      value.kind === "chip")
  );
}

/** The base with spreadsheet-style helper columns added as custom columns, so they can be grouped by and aggregated. */
export function withHelperColumns(
  base: SummaryBase,
  helperColumns: readonly SummaryExpression[],
): SummaryBase {
  return {
    ...base,
    query: helperColumns.reduce(
      (query, { name, clause }) =>
        Lib.expression(query, base.stageIndex, name, clause),
      base.query,
    ),
  };
}

/** A name for a new helper column that doesn't clash with the base's columns. */
export function getHelperColumnName(base: SummaryBase, name: string): string {
  const { query, stageIndex } = base;
  const usedNames = new Set(
    Lib.returnedColumns(query, stageIndex).map((column) =>
      Lib.displayInfo(query, stageIndex, column).displayName.toLowerCase(),
    ),
  );
  return getUniqueName(name, usedNames);
}

/** Removes every grouping and value built on `column`, e.g. after the helper column it comes from is removed. */
export function removeColumnItems(
  base: SummaryBase,
  definition: SummaryDefinition,
  column: Lib.ColumnMetadata,
): SummaryDefinition {
  const columnKey = getItemKey(base, column);
  const isOtherColumn = (itemColumn: Lib.ColumnMetadata) =>
    getItemKey(base, itemColumn) !== columnKey;
  const isKeptDimension = (dimension: SummaryDimension) =>
    !("column" in dimension) || isOtherColumn(dimension.column);
  return {
    ...definition,
    rows: definition.rows.filter(isKeptDimension),
    columns: definition.columns.filter(isKeptDimension),
    values: definition.values.filter(
      (value) => value.type !== "column" || isOtherColumn(value.column),
    ),
  };
}

/** Adds a helper column, renamed if its name is taken. */
export function addHelperColumn(
  base: SummaryBase,
  helperColumns: readonly SummaryExpression[],
  { name, clause }: SummaryExpression,
): SummaryExpression[] {
  return [...helperColumns, { name: getHelperColumnName(base, name), clause }];
}

/**
 * Replaces the helper column at `index` with `expression`, or removes it when `expression` is `null`.
 * Groupings and values built on a removed or renamed helper column are removed with it.
 */
export function replaceHelperColumn(
  sourceBase: SummaryBase,
  helperColumns: readonly SummaryExpression[],
  definition: SummaryDefinition,
  index: number,
  expression: SummaryExpression | null,
): { helperColumns: SummaryExpression[]; definition: SummaryDefinition } {
  const helperColumn = helperColumns[index];
  if (helperColumn == null) {
    return { helperColumns: [...helperColumns], definition };
  }
  const otherHelperColumns = helperColumns.filter(
    (_column, otherIndex) => otherIndex !== index,
  );
  if (expression == null) {
    return {
      helperColumns: otherHelperColumns,
      definition: withoutHelperColumnItems(
        sourceBase,
        helperColumns,
        definition,
        helperColumn,
      ),
    };
  }

  const isRenamed =
    expression.name.toLowerCase() !== helperColumn.name.toLowerCase();
  const name = isRenamed
    ? getHelperColumnName(
        withHelperColumns(sourceBase, otherHelperColumns),
        expression.name,
      )
    : helperColumn.name;
  return {
    helperColumns: helperColumns.map((column, otherIndex) =>
      otherIndex === index ? { name, clause: expression.clause } : column,
    ),
    definition: isRenamed
      ? withoutHelperColumnItems(
          sourceBase,
          helperColumns,
          definition,
          helperColumn,
        )
      : definition,
  };
}

function withoutHelperColumnItems(
  sourceBase: SummaryBase,
  helperColumns: readonly SummaryExpression[],
  definition: SummaryDefinition,
  helperColumn: SummaryExpression,
): SummaryDefinition {
  const base = withHelperColumns(sourceBase, helperColumns);
  const { query, stageIndex } = base;
  const column = findExpressionColumn(
    query,
    stageIndex,
    Lib.breakoutableColumns(query, stageIndex),
    helperColumn.name,
  );
  return column != null
    ? removeColumnItems(base, definition, column)
    : definition;
}
