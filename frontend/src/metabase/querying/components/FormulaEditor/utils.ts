import * as Lib from "metabase-lib";

const DEFAULT_FORMULA_NAME_MAX_LENGTH = 40;
const DEFAULT_FORMULA_NAME_ELLIPSIS = "…";
const UNIQUE_NAME_SUFFIX = /^ \(\d+\)$/;

export function getDefaultFormulaName(source: string): string {
  const name = source
    .replace(/\[([^\]]*)\]?/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return name.length > DEFAULT_FORMULA_NAME_MAX_LENGTH
    ? `${name.slice(0, DEFAULT_FORMULA_NAME_MAX_LENGTH - 1).trimEnd()}${DEFAULT_FORMULA_NAME_ELLIPSIS}`
    : name;
}

export function isDefaultFormulaName(name: string, formula: string): boolean {
  const defaultName = getDefaultFormulaName(formula);
  return (
    name === defaultName ||
    (name.startsWith(defaultName) &&
      UNIQUE_NAME_SUFFIX.test(name.slice(defaultName.length)))
  );
}

export function getFormulaColumns(
  query: Lib.Query,
  stageIndex: number,
  expressionMode: Lib.ExpressionMode,
  expressionIndex?: number,
) {
  if (expressionMode === "aggregation") {
    return Lib.aggregableColumns(query, stageIndex, expressionIndex);
  }
  if (expressionMode === "filter") {
    return Lib.filterableColumns(query, stageIndex);
  }
  return Lib.expressionableColumns(query, stageIndex, expressionIndex);
}
