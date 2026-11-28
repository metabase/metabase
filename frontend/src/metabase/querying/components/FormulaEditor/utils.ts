import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import type { NamedExpression, StageExpression } from "./types";

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

/** Finds a custom column again in a later version of its query. */
export function findExpression(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.ExpressionClause,
): StageExpression | undefined {
  const expressions = Lib.expressions(query, stageIndex);
  const index = expressions.findIndex((expression) =>
    Lib.isSameClause(expression, clause),
  );
  return index >= 0 ? { clause: expressions[index], index } : undefined;
}

/**
 * Replaces a custom column with an edited formula, and returns the custom column's new name.
 *
 * A custom name stays. A name generated from the formula follows the new formula, unless it
 * still describes it.
 */
export function editExpression(
  query: Lib.Query,
  stageIndex: number,
  expression: Lib.ExpressionClause,
  { name: sourceName, clause }: NamedExpression,
  hasCustomName: boolean,
): { query: Lib.Query; name: string } {
  const { displayName } = Lib.displayInfo(query, stageIndex, expression);
  const name =
    hasCustomName || isDefaultFormulaName(displayName, sourceName)
      ? displayName
      : getUniqueExpressionName(query, stageIndex, sourceName);
  return {
    query: Lib.replaceClause(
      query,
      stageIndex,
      expression,
      Lib.withExpressionName(clause, name),
    ),
    name,
  };
}
