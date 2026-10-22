import { diagnoseAndCompile, format } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";
import type {
  Database,
  SuggestSummaryFormulaRequest,
  SuggestSummaryPlanRequest,
  SuggestSummaryPlanResponse,
  SummaryPlanBreakout,
  SummaryPlanValue,
} from "metabase-types/api";

import type {
  SummaryBase,
  SummaryDefinition,
  SummaryExpression,
  SummaryWellId,
} from "../../../../components/view/SummarySidebar/types";
import {
  addCountValue,
  addExpressionDimension,
  addExpressionValue,
  addMetricValue,
  createItemId,
  dropOnWell,
  findDimension,
  getColumnLabel,
  getColumnOperatorOptions,
  getDefaultFormulaName,
  getFormulaClause,
} from "../../../../components/view/SummarySidebar/utils";

export type ExpressionMode = "aggregation" | "expression";

const EMPTY_DEFINITION: SummaryDefinition = {
  rows: [],
  columns: [],
  values: [],
};

export function getExpressionMode(wellId: SummaryWellId): ExpressionMode {
  return wellId === "values" ? "aggregation" : "expression";
}

function getAvailableColumns(
  base: SummaryBase,
  expressionMode: ExpressionMode,
) {
  return expressionMode === "aggregation"
    ? Lib.aggregableColumns(base.query, base.stageIndex)
    : Lib.expressionableColumns(base.query, base.stageIndex);
}

function getAvailableMetrics(
  base: SummaryBase,
  expressionMode: ExpressionMode,
) {
  return expressionMode === "aggregation"
    ? Lib.availableMetrics(base.query, base.stageIndex)
    : undefined;
}

function getColumnType(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return "boolean";
  }
  if (Lib.isNumeric(column)) {
    return "number";
  }
  if (Lib.isTemporal(column)) {
    return "date";
  }
  if (Lib.isStringOrStringLike(column)) {
    return "text";
  }
  return null;
}

/** A column's name in formulas, e.g. `Product → Category`, which is also how AI refers to it. */
function getColumnFormulaName(
  { query, stageIndex }: SummaryBase,
  column: Lib.ColumnMetadata,
) {
  return Lib.displayInfo(query, stageIndex, column).longDisplayName;
}

function getMetricName(
  { query, stageIndex }: SummaryBase,
  metric: Lib.MetricMetadata,
) {
  return Lib.displayInfo(query, stageIndex, metric).displayName;
}

function getTableName(base: SummaryBase) {
  const { query, stageIndex } = base;
  const sourceTable = Lib.sourceTableOrCardId(query);
  const table =
    sourceTable != null
      ? Lib.tableOrCardMetadata(query, sourceTable)
      : undefined;
  return table != null
    ? Lib.displayInfo(query, stageIndex, table).displayName
    : null;
}

function getColumnsPayload(base: SummaryBase, columns: Lib.ColumnMetadata[]) {
  return columns.map((column) => ({
    name: getColumnFormulaName(base, column),
    type: getColumnType(column),
  }));
}

type CurrentFormula = {
  expression: string;
  name: string;
};

/**
 * What AI needs to draft a formula for `prompt`: the columns (and, for Values, metrics) the formula
 * can reference, by the names the formula editor knows them by. With `current`, `prompt` describes
 * a change to that formula instead.
 */
export function getFormulaRequest(
  base: SummaryBase,
  prompt: string,
  expressionMode: ExpressionMode,
  current?: CurrentFormula,
): SuggestSummaryFormulaRequest {
  return {
    prompt,
    mode: expressionMode,
    columns: getColumnsPayload(base, getAvailableColumns(base, expressionMode)),
    metrics: getAvailableMetrics(base, expressionMode)?.map((metric) =>
      getMetricName(base, metric),
    ),
    table_name: getTableName(base),
    current_expression: current?.expression,
    current_name: current?.name,
  };
}

/** What AI needs to plan a whole summary for `prompt`: the columns to group or aggregate, and the metrics. */
export function getPlanRequest(
  base: SummaryBase,
  prompt: string,
): SuggestSummaryPlanRequest {
  return {
    prompt,
    columns: getColumnsPayload(
      base,
      Lib.breakoutableColumns(base.query, base.stageIndex),
    ),
    metrics: Lib.availableMetrics(base.query, base.stageIndex).map((metric) =>
      getMetricName(base, metric),
    ),
    table_name: getTableName(base),
  };
}

export type CompiledFormula =
  | { expression: SummaryExpression }
  | { error: string };

/** The drafted formula as a well item, or why it doesn't compile against the summary's query. */
export function compileFormula(
  base: SummaryBase,
  database: Database | undefined,
  expressionMode: ExpressionMode,
  { source, name }: { source: string; name: string },
): CompiledFormula {
  const { error, expressionClause } = diagnoseAndCompile({
    source,
    expressionMode,
    query: base.query,
    stageIndex: base.stageIndex,
    database,
    availableColumns: getAvailableColumns(base, expressionMode),
    availableMetrics: getAvailableMetrics(base, expressionMode),
  });
  if (error != null || expressionClause == null) {
    return { error: error?.message ?? source };
  }
  return { expression: { name, clause: expressionClause } };
}

function isSameName(name: string, otherName: string) {
  return name.trim().toLowerCase() === otherName.trim().toLowerCase();
}

function findColumnByName(
  base: SummaryBase,
  name: string,
): Lib.ColumnMetadata | undefined {
  const columns = Lib.breakoutableColumns(base.query, base.stageIndex);
  return (
    columns.find((column) =>
      isSameName(getColumnFormulaName(base, column), name),
    ) ??
    columns.find((column) => isSameName(getColumnLabel(base, column), name))
  );
}

function withTemporalUnit(
  base: SummaryBase,
  column: Lib.ColumnMetadata,
  temporalUnit: string | undefined,
): Lib.ColumnMetadata {
  if (temporalUnit == null) {
    return column;
  }
  const { query, stageIndex } = base;
  const bucket = Lib.availableTemporalBuckets(query, stageIndex, column).find(
    (bucket) =>
      Lib.displayInfo(query, stageIndex, bucket).shortName === temporalUnit,
  );
  return bucket != null ? Lib.withTemporalBucket(column, bucket) : column;
}

function compilePlanFormula(
  base: SummaryBase,
  database: Database | undefined,
  expressionMode: ExpressionMode,
  { expression, name }: { expression: string; name?: string },
): SummaryExpression | null {
  const compiled = compileFormula(base, database, expressionMode, {
    source: expression,
    name: name || getDefaultFormulaName(expression),
  });
  return "expression" in compiled ? compiled.expression : null;
}

function addPlanValue(
  base: SummaryBase,
  database: Database | undefined,
  definition: SummaryDefinition,
  value: SummaryPlanValue,
): SummaryDefinition | null {
  switch (value.kind) {
    case "count":
      return addCountValue(definition);
    case "metric": {
      const metric = Lib.availableMetrics(base.query, base.stageIndex).find(
        (metric) => isSameName(getMetricName(base, metric), value.metric),
      );
      return metric != null ? addMetricValue(base, definition, metric) : null;
    }
    case "aggregation": {
      const column = findColumnByName(base, value.column);
      const isAvailable =
        column != null &&
        getColumnOperatorOptions(base, column).some(
          (option) => option.shortName === value.operator,
        );
      if (column == null || !isAvailable) {
        return null;
      }
      return {
        ...definition,
        values: [
          ...definition.values,
          {
            id: createItemId(),
            type: "column",
            column,
            operatorShortName: value.operator,
          },
        ],
      };
    }
    case "formula": {
      const expression = compilePlanFormula(
        base,
        database,
        "aggregation",
        value,
      );
      return expression != null
        ? addExpressionValue(definition, expression)
        : null;
    }
  }
}

function addPlanBreakout(
  base: SummaryBase,
  database: Database | undefined,
  definition: SummaryDefinition,
  breakout: SummaryPlanBreakout,
): SummaryDefinition | null {
  switch (breakout.kind) {
    case "column": {
      const column = findColumnByName(base, breakout.column);
      if (column == null) {
        return null;
      }
      return dropOnWell(
        base,
        definition,
        {
          kind: "column",
          column: withTemporalUnit(base, column, breakout.temporal_unit),
          label: getColumnLabel(base, column),
        },
        "columns",
      );
    }
    case "formula": {
      const expression = compilePlanFormula(
        base,
        database,
        "expression",
        breakout,
      );
      return expression != null
        ? addExpressionDimension(definition, "columns", expression)
        : null;
    }
  }
}

export type AppliedSummaryPlan = {
  definition: SummaryDefinition;
  /** Planned items that didn't resolve against the query, e.g. a misnamed column or a formula that doesn't compile. */
  skippedCount: number;
};

/** A new summary made of the plan's items, skipping any that don't resolve against the summary's query. */
export function applySummaryPlan(
  base: SummaryBase,
  database: Database | undefined,
  plan: SuggestSummaryPlanResponse,
): AppliedSummaryPlan {
  let definition = EMPTY_DEFINITION;
  let skippedCount = 0;
  for (const value of plan.values) {
    const nextDefinition = addPlanValue(base, database, definition, value);
    definition = nextDefinition ?? definition;
    skippedCount += nextDefinition == null ? 1 : 0;
  }
  for (const breakout of plan.breakouts) {
    const nextDefinition = addPlanBreakout(
      base,
      database,
      definition,
      breakout,
    );
    definition = nextDefinition ?? definition;
    skippedCount += nextDefinition == null ? 1 : 0;
  }
  return { definition, skippedCount };
}

/**
 * The formula an item stands for, for AI to change: its own formula, the aggregation a count or
 * column value stands for, or the bare reference to a metric or grouped-by column.
 */
export async function getItemFormula(
  base: SummaryBase,
  definition: SummaryDefinition,
  itemId: string,
): Promise<string | null> {
  const { query, stageIndex } = base;
  const dimension = findDimension(definition, itemId);
  const clause = getFormulaClause(base, definition, itemId);
  if (clause != null) {
    return format(clause, {
      query,
      stageIndex,
      availableColumns: getAvailableColumns(
        base,
        dimension != null ? "expression" : "aggregation",
      ),
      printWidth: Infinity,
    });
  }
  if (dimension != null && "column" in dimension) {
    return `[${getColumnFormulaName(base, dimension.column)}]`;
  }
  const value = definition.values.find(({ id }) => id === itemId);
  if (value?.type === "metric") {
    return `[${getMetricName(base, value.metric)}]`;
  }
  return null;
}
