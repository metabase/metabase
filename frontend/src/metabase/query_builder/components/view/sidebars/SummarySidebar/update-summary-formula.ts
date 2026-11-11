import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type { SummaryGeneratedExpression } from "metabase-types/api";

import {
  makeSummaryFormula,
  reconcileSummaryFormulas,
} from "../../../../utils/summary-formulas";

import { removeUnusedFormula } from "./formula-ownership";
import type { SummaryQueryChangeOptions } from "./types";
import { getDimensionItems } from "./utils";

type Options = SummaryQueryChangeOptions & {
  query: Lib.Query;
  nextQuery: Lib.Query;
  stageIndex: number;
  generatedExpressions: SummaryGeneratedExpression[];
};

export function updateSummaryFormula({
  query,
  nextQuery,
  stageIndex,
  generatedExpressions,
  createdFormula,
}: Options) {
  const index =
    stageIndex < 0 ? Lib.stageCount(query) + stageIndex : stageIndex;
  const owned = reconcileSummaryFormulas(query, generatedExpressions);
  let formulas = owned;

  if (createdFormula) {
    const existingNames = Lib.expressions(query, index).map(
      (clause) => Lib.displayInfo(query, index, clause).displayName,
    );
    const created = Lib.expressions(nextQuery, index)
      .map((clause) => Lib.displayInfo(nextQuery, index, clause).displayName)
      .filter((name) => !existingNames.includes(name))
      .map((name) => makeSummaryFormula(nextQuery, index, name))
      .filter(isNotNull);
    formulas = [...formulas, ...created];
  }

  const groupingNames = getDimensionItems(nextQuery, index).flatMap((item) =>
    item.expression
      ? [Lib.displayInfo(nextQuery, index, item.expression).displayName]
      : [],
  );
  const removed = owned.filter(
    (formula) =>
      formula.stageIndex === index &&
      !groupingNames.includes(formula.name) &&
      makeSummaryFormula(nextQuery, index, formula.name)?.expression ===
        formula.expression,
  );
  const cleanedQuery = removed.reduce((currentQuery, formula) => {
    const expression = Lib.expressions(currentQuery, index).find(
      (clause) =>
        Lib.displayInfo(currentQuery, index, clause).displayName ===
        formula.name,
    );
    return expression
      ? removeUnusedFormula(currentQuery, index, expression)
      : currentQuery;
  }, nextQuery);
  return {
    query: cleanedQuery,
    generatedExpressions: reconcileSummaryFormulas(cleanedQuery, formulas),
  };
}
