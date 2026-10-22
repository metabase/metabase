import { diagnoseAndCompile } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";
import type {
  Database,
  SuggestSummaryFormulaRequest,
} from "metabase-types/api";

import type {
  SummaryBase,
  SummaryExpression,
} from "../../../../components/view/SummarySidebar/types";

type ExpressionMode = "aggregation" | "expression";

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

/**
 * What AI needs to draft a formula for `prompt`: the columns (and, for Values, metrics) the formula
 * can reference, by the names the formula editor knows them by.
 */
export function getFormulaRequest(
  base: SummaryBase,
  prompt: string,
  expressionMode: ExpressionMode,
): SuggestSummaryFormulaRequest {
  const { query, stageIndex } = base;
  const columns = getAvailableColumns(base, expressionMode).map((column) => ({
    name: Lib.displayInfo(query, stageIndex, column).longDisplayName,
    type: getColumnType(column),
  }));
  const metrics = getAvailableMetrics(base, expressionMode)?.map(
    (metric) => Lib.displayInfo(query, stageIndex, metric).displayName,
  );
  const sourceTable = Lib.sourceTableOrCardId(query);
  const table =
    sourceTable != null
      ? Lib.tableOrCardMetadata(query, sourceTable)
      : undefined;

  return {
    prompt,
    mode: expressionMode,
    columns,
    metrics,
    table_name:
      table != null
        ? Lib.displayInfo(query, stageIndex, table).displayName
        : null,
  };
}

/** The drafted formula as a well item, or `null` if it doesn't compile against the summary's query. */
export function compileFormula(
  base: SummaryBase,
  database: Database | undefined,
  expressionMode: ExpressionMode,
  { source, name }: { source: string; name: string },
): SummaryExpression | null {
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
    return null;
  }
  return { name, clause: expressionClause };
}
