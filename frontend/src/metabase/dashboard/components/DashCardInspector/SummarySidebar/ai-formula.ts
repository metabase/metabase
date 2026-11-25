import * as Lib from "metabase-lib";
import type { SuggestSummaryFormulaRequest } from "metabase-types/api";

import type { SummaryBase, SummaryExpressionMode } from "./types";
import { getFormulaColumns, getFormulaMetrics } from "./utils";

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
  expressionMode: SummaryExpressionMode,
): SuggestSummaryFormulaRequest {
  const { query, stageIndex } = base;
  const columns = getFormulaColumns(base, expressionMode).map((column) => ({
    name: Lib.displayInfo(query, stageIndex, column).longDisplayName,
    type: getColumnType(column),
  }));
  const metrics = getFormulaMetrics(base, expressionMode)?.map(
    (metric) => Lib.displayInfo(query, stageIndex, metric).displayName,
  );
  return {
    prompt,
    mode: expressionMode,
    columns,
    metrics,
    // PROTOTYPE: the table's name is left out; the call that read it is gone from master
    table_name: null,
  };
}
