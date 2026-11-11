import { stableStringify } from "metabase/utils/objects";
import * as Lib from "metabase-lib";
import type { SummaryGeneratedExpression } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

export function getSummaryBreakout(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.BreakoutClause,
) {
  const column = Lib.breakoutColumn(query, stageIndex, clause);
  const ref = column && Lib.legacyRef(query, stageIndex, column);
  return ref?.[0] === "expression"
    ? { name: ref[1], options: stableStringify(ref[2] ?? {}) }
    : undefined;
}

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
  if (!isObject(stage.expressions) || !Object.hasOwn(stage.expressions, name)) {
    return;
  }
  const breakout = Lib.breakouts(query, index)
    .map((clause) => getSummaryBreakout(query, index, clause))
    .find((info) => info?.name === name);
  return {
    stageIndex: index,
    name,
    expression: stableStringify(stage.expressions[name]),
    breakoutOptions: breakout?.options,
  };
}

export function reconcileSummaryFormulas(
  query: Lib.Query,
  formulas: SummaryGeneratedExpression[],
): SummaryGeneratedExpression[] {
  return formulas.flatMap((formula) => {
    const current = makeSummaryFormula(query, formula.stageIndex, formula.name);
    if (!current || current.expression !== formula.expression) {
      return [];
    }
    const breakouts = Lib.breakouts(query, formula.stageIndex)
      .map((clause) => getSummaryBreakout(query, formula.stageIndex, clause))
      .filter((info) => info?.name === formula.name);
    const options =
      formula.breakoutOptions ??
      (breakouts.length === 1 ? breakouts[0]?.options : undefined);
    return options && breakouts.some((info) => info?.options === options)
      ? [{ ...formula, breakoutOptions: options }]
      : [];
  });
}
