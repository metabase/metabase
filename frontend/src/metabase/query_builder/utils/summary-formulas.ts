import type { SummaryGeneratedExpression } from "metabase/redux/store";
import { stableStringify } from "metabase/utils/objects";
import * as Lib from "metabase-lib";
import { isObject } from "metabase-types/guards";

export function getLegacyStage(
  query: Lib.Query,
  stageIndex: number,
): Record<string, unknown> | undefined {
  const stageCount = Lib.stageCount(query);
  const index = stageIndex < 0 ? stageCount + stageIndex : stageIndex;
  if (
    index < 0 ||
    index >= stageCount ||
    Lib.queryDisplayInfo(query).isNative
  ) {
    return;
  }
  const legacyQuery: unknown = Lib.toLegacyQuery(query);
  if (!isObject(legacyQuery) || !isObject(legacyQuery.query)) {
    return;
  }
  let stage = legacyQuery.query;
  for (let stageNumber = stageCount - 1; stageNumber > index; stageNumber--) {
    const source = stage["source-query"];
    if (!isObject(source)) {
      return;
    }
    stage = source;
  }
  return stage;
}

export function makeSummaryFormula(
  query: Lib.Query,
  stageIndex: number,
  name: string,
): SummaryGeneratedExpression | undefined {
  const stageCount = Lib.stageCount(query);
  const index = stageIndex < 0 ? stageCount + stageIndex : stageIndex;
  const stage = getLegacyStage(query, stageIndex);
  if (
    !stage ||
    !isObject(stage.expressions) ||
    !Object.hasOwn(stage.expressions, name)
  ) {
    return;
  }
  return {
    stageIndex: index,
    name,
    expression: stableStringify(stage.expressions[name]),
  };
}

export function reconcileSummaryFormulas(
  query: Lib.Query,
  formulas: SummaryGeneratedExpression[],
): SummaryGeneratedExpression[] {
  return formulas.filter((formula) => {
    const current = makeSummaryFormula(query, formula.stageIndex, formula.name);
    if (!current || current.expression !== formula.expression) {
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
