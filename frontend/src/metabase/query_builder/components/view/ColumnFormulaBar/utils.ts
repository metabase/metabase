import { t } from "ttag";

import {
  type NamedExpression,
  isDefaultFormulaName,
} from "metabase/querying/components/FormulaEditor";
import type {
  ClickAction,
  ClickObject,
  CustomClickAction,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import type { ColumnExpression } from "./types";

/**
 * The custom column of a header click, when the stage defines it. The column can be the
 * custom column itself, or a grouping of it when the stage is a summary.
 *
 * Custom columns are matched by display name, because the column `name` of a long or
 * case-colliding custom column is shortened or suffixed.
 */
export function findClickedExpression(
  query: Lib.Query,
  stageIndex: number,
  { column, value, columnShortcuts }: ClickObject,
): Lib.ExpressionClause | undefined {
  if (!column || value !== undefined || columnShortcuts) {
    return undefined;
  }
  const expressions = Lib.expressions(query, stageIndex);
  // The aggregation ref of a summary column does not resolve in the stage after the summary.
  if (expressions.length === 0 || column.source === "aggregation") {
    return undefined;
  }
  const stageColumn = Lib.findMatchingColumn(
    query,
    stageIndex,
    Lib.fromLegacyColumn(query, stageIndex, column),
    Lib.visibleColumns(query, stageIndex),
  );
  if (!stageColumn) {
    return undefined;
  }
  const { isCalculated, displayName } = Lib.displayInfo(
    query,
    stageIndex,
    stageColumn,
  );
  if (!isCalculated) {
    return undefined;
  }
  return expressions.find(
    (expression) =>
      Lib.displayInfo(query, stageIndex, expression).displayName ===
      displayName,
  );
}

export function findExpression(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.ExpressionClause,
): ColumnExpression | undefined {
  const expressions = Lib.expressions(query, stageIndex);
  const index = expressions.findIndex((expression) =>
    Lib.isSameClause(expression, clause),
  );
  return index >= 0 ? { clause: expressions[index], index } : undefined;
}

/**
 * A custom name stays through an edit. A name generated from the formula follows the new
 * formula, unless it still describes it.
 */
function getEditedExpressionName(
  query: Lib.Query,
  stageIndex: number,
  name: string,
  source: string,
  sourceName: string,
): string {
  const hasCustomName = !isDefaultFormulaName(name, source);
  if (hasCustomName || isDefaultFormulaName(name, sourceName)) {
    return name;
  }
  return getUniqueExpressionName(query, stageIndex, sourceName);
}

/** Replaces a custom column that the editor opened with `source`. */
export function editExpression(
  query: Lib.Query,
  stageIndex: number,
  expression: Lib.ExpressionClause,
  source: string,
  { name: sourceName, clause }: NamedExpression,
): Lib.Query {
  const { displayName: name } = Lib.displayInfo(query, stageIndex, expression);
  const nextName = getEditedExpressionName(
    query,
    stageIndex,
    name,
    source,
    sourceName,
  );
  return Lib.replaceClause(
    query,
    stageIndex,
    expression,
    Lib.withExpressionName(clause, nextName),
  );
}

/** The custom column behind a header click on a grouping of the last stage's summary. */
export function findClickedSummaryFormula(
  query: Lib.Query,
  clicked: ClickObject,
): Lib.ExpressionClause | undefined {
  const stageIndex = -1;
  if (Lib.breakouts(query, stageIndex).length === 0) {
    return undefined;
  }
  return findClickedExpression(query, stageIndex, clicked);
}

/** Puts "Edit formula" where "Combine columns" is for other columns. */
export function withEditFormulaAction(
  actions: ClickAction[],
  onEdit: () => void,
): ClickAction[] {
  const editFormulaAction: CustomClickAction = {
    name: "edit-formula",
    type: "custom",
    title: t`Edit formula`,
    section: "combine",
    icon: "function",
    buttonType: "horizontal",
    onClick: ({ closePopover }) => {
      closePopover();
      onEdit();
    },
  };
  return [
    ...actions.filter((action) => action.name !== "combine"),
    editFormulaAction,
  ];
}
