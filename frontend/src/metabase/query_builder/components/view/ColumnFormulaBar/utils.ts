import { t } from "ttag";

import type {
  ClickAction,
  CustomClickAction,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type { DatasetColumn } from "metabase-types/api";

/**
 * The custom column behind a result column, when the stage defines it. The column can be the
 * custom column itself, or a grouping of it when the stage is a summary.
 */
export function findColumnExpression(
  query: Lib.Query,
  stageIndex: number,
  column: DatasetColumn,
): Lib.ExpressionClause | undefined {
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
      // matched by display name, because the column `name` of a long or
      // case-colliding custom column is shortened or suffixed.
      Lib.displayInfo(query, stageIndex, expression).displayName ===
      displayName,
  );
}

export function findColumnLastStageExpression(
  query: Lib.Query,
  column: DatasetColumn,
): Lib.ExpressionClause | undefined {
  return findColumnExpression(query, -1, column);
}

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
