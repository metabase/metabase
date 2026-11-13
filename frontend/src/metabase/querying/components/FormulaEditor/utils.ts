import * as Lib from "metabase-lib";

const DEFAULT_FORMULA_NAME_MAX_LENGTH = 40;
const DEFAULT_FORMULA_NAME_ELLIPSIS = "…";
const UNIQUE_NAME_SUFFIX = / \(\d+\)$/;

export function getDefaultFormulaName(source: string): string {
  const name = source
    .replace(/\[([^\]]*)\]?/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return name.length > DEFAULT_FORMULA_NAME_MAX_LENGTH
    ? `${name.slice(0, DEFAULT_FORMULA_NAME_MAX_LENGTH - 1).trimEnd()}${DEFAULT_FORMULA_NAME_ELLIPSIS}`
    : name;
}

function getComparableFormulaText(text: string) {
  return text.replace(/[\s[\]"']/g, "").toLowerCase();
}

/**
 * True when `name` is the default name of `source`, written with any spacing, case, or quotes, and maybe made
 * unique with a ` (n)` suffix. A name the user chose is not.
 */
export function isDefaultFormulaName(name: string, source: string): boolean {
  const baseName = name.replace(UNIQUE_NAME_SUFFIX, "");
  const isCapped = baseName.endsWith(DEFAULT_FORMULA_NAME_ELLIPSIS);
  const nameText = getComparableFormulaText(
    isCapped
      ? baseName.slice(0, -DEFAULT_FORMULA_NAME_ELLIPSIS.length)
      : baseName,
  );
  const sourceText = getComparableFormulaText(source);
  if (isCapped) {
    return nameText.length > 0 && sourceText.startsWith(nameText);
  }
  return nameText === sourceText;
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
