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
