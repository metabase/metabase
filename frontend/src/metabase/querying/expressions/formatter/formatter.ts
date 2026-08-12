import * as Lib from "metabase-lib";

import type { FormatClauseOptions, FormatOptions } from "./types";

export async function format(
  expression: Lib.Expressionable,
  options: FormatClauseOptions,
) {
  const { query, stageIndex } = options;
  const parts = Lib.expressionParts(query, stageIndex, expression);
  return formatExpressionParts(parts, options);
}

/**
 * The printer pulls in prettier's document layout engine, so it is loaded on
 * demand to keep it out of the initial bundle.
 */
export async function formatExpressionParts(
  root: Lib.ExpressionParts | Lib.ExpressionArg,
  options: FormatOptions = {},
) {
  const { printExpressionParts } = await import("./print");
  return printExpressionParts(root, options);
}
