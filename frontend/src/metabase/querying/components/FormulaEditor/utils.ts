import * as Lib from "metabase-lib";

const DEFAULT_FORMULA_NAME_MAX_LENGTH = 40;

export function getDefaultFormulaName(source: string): string {
  const name = source
    .replace(/\[([^\]]*)\]?/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return name.length > DEFAULT_FORMULA_NAME_MAX_LENGTH
    ? `${name.slice(0, DEFAULT_FORMULA_NAME_MAX_LENGTH - 1).trimEnd()}…`
    : name;
}

export function getFormulaColumns(
  query: Lib.Query,
  stageIndex: number,
  expressionMode: Lib.ExpressionMode,
) {
  if (expressionMode === "aggregation") {
    return Lib.aggregableColumns(query, stageIndex);
  }
  if (expressionMode === "filter") {
    return Lib.filterableColumns(query, stageIndex);
  }
  return Lib.expressionableColumns(query, stageIndex);
}
