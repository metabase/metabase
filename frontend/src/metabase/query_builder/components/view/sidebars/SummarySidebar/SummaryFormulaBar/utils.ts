import type { NamedExpression } from "metabase/querying/components/FormulaEditor";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import type { SummaryWellId } from "../types";

export function addSummaryFormula(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
  { name, clause }: NamedExpression,
): Lib.Query {
  if (wellId === "values") {
    return Lib.aggregate(
      query,
      stageIndex,
      Lib.withExpressionName(clause, name),
    );
  }
  const uniqueName = getUniqueExpressionName(query, stageIndex, name);
  const nextQuery = Lib.expression(query, stageIndex, uniqueName, clause);
  const column = Lib.breakoutableColumns(nextQuery, stageIndex).find(
    (column) => {
      const info = Lib.displayInfo(nextQuery, stageIndex, column);
      return info.isCalculated && info.displayName === uniqueName;
    },
  );
  return Lib.breakout(
    nextQuery,
    stageIndex,
    Lib.withDefaultBucket(nextQuery, stageIndex, checkNotNull(column)),
  );
}
