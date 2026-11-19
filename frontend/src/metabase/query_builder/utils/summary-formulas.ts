import type { SummaryGeneratedExpression } from "metabase/redux/store";
import * as Lib from "metabase-lib";

export function makeSummaryFormula(
  query: Lib.Query,
  stageIndex: number,
  name: string,
): SummaryGeneratedExpression | undefined {
  const stageCount = Lib.stageCount(query);
  const index = stageIndex < 0 ? stageCount + stageIndex : stageIndex;
  if (
    index < 0 ||
    index >= stageCount ||
    Lib.queryDisplayInfo(query).isNative
  ) {
    return;
  }
  const expression = Lib.expressions(query, index).find(
    (clause) => Lib.displayInfo(query, index, clause).displayName === name,
  );
  if (!expression) {
    return;
  }
  return {
    stageIndex: index,
    name,
    uuid: Lib.clauseUuid(expression),
  };
}

export function reconcileSummaryFormulas(
  query: Lib.Query,
  formulas: SummaryGeneratedExpression[],
): SummaryGeneratedExpression[] {
  return formulas.filter((formula) => {
    const current = makeSummaryFormula(query, formula.stageIndex, formula.name);
    if (!current || current.uuid !== formula.uuid) {
      return false;
    }
    return Lib.breakouts(query, formula.stageIndex).some((breakout) => {
      const column = Lib.breakoutColumn(query, formula.stageIndex, breakout);
      if (!column) {
        return false;
      }
      const info = Lib.displayInfo(query, formula.stageIndex, column);
      return info.isCalculated && info.name === formula.name;
    });
  });
}
