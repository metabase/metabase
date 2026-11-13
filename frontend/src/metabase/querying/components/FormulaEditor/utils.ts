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

function normalizeFormulaText(text: string): string {
  return text
    .replace(/\[([^\]]*)\]?/g, "$1")
    .replace(/'/g, '"')
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * Whether `name` is the default name of `source`, as the formula may have been typed with
 * other spacing, letter case, or quotes than its printed form.
 */
export function isDefaultFormulaName(name: string, source: string): boolean {
  const isTruncated = name.endsWith("…");
  const normalizedName = normalizeFormulaText(
    isTruncated ? name.slice(0, -1) : name,
  );
  const normalizedSource = normalizeFormulaText(source);
  if (normalizedName.length === 0) {
    return false;
  }
  return isTruncated
    ? normalizedSource.startsWith(normalizedName)
    : normalizedSource === normalizedName;
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
