import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import type { SummarySession } from "./SummarySidebar/summary-session";
import type {
  SummaryBase,
  SummaryDimension,
  SummaryValue,
} from "./SummarySidebar/types";
import {
  getColumnOperatorOptions,
  getSummaryBase,
} from "./SummarySidebar/utils";

const STAGE_INDEX = -1;

/**
 * PROTOTYPE: one aggregation of the card's query as a "Summarize by" chip:
 * Count, an operator on a column (Sum of Total), or anything else as a formula.
 */
function getValue(
  query: Lib.Query,
  base: SummaryBase,
  clause: Lib.AggregationClause,
  id: string,
): SummaryValue {
  const parts = Lib.expressionParts(query, STAGE_INDEX, clause);
  const [firstArg] = parts.args;

  if (parts.operator === "count" && parts.args.length === 0) {
    return { id, type: "count" };
  }

  if (parts.args.length === 1 && Lib.isColumnMetadata(firstArg)) {
    const isColumnOperator = getColumnOperatorOptions(base, firstArg).some(
      (option) => option.shortName === parts.operator,
    );
    if (isColumnOperator) {
      return {
        id,
        type: "column",
        column: firstArg,
        operatorShortName: parts.operator,
      };
    }
  }

  return {
    id,
    type: "expression",
    expression: {
      name: Lib.displayInfo(query, STAGE_INDEX, clause).displayName,
      clause: Lib.expressionClause(parts),
    },
  };
}

/**
 * PROTOTYPE: a summary to edit, read from the card's own query. The
 * aggregations of the query's last stage become the "Summarize by" chips and
 * its breakouts the "Group by" chips. The query without them is what the
 * summary is built on.
 *
 * The Summarize sidebar this comes from always starts empty and summarizes on
 * top of the question. A dashboard card is usually summarized already, so
 * here the bins start with what the card has.
 */
export function getCardSummarySession(question: Question): SummarySession {
  const query = question.query();
  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  const breakouts = Lib.breakouts(query, STAGE_INDEX);

  try {
    const rawQuery = [...aggregations, ...breakouts].reduce(
      (result, clause) => Lib.removeClause(result, STAGE_INDEX, clause),
      query,
    );
    const base = getSummaryBase(rawQuery);

    const values = aggregations.map((clause, index) =>
      getValue(query, base, clause, `card-value-${index}`),
    );
    const columns = breakouts.flatMap((clause, index): SummaryDimension[] => {
      const column = Lib.breakoutColumn(query, STAGE_INDEX, clause);
      return column ? [{ id: `card-dimension-${index}`, column }] : [];
    });

    return {
      sourceQuestion: question.setQuery(rawQuery),
      base,
      definition: { rows: [], columns, values },
      outputFilters: [],
    };
  } catch (error) {
    // a query this can't read: start empty and summarize on top of the card
    console.warn("Inspector: could not read the card's summary", error);
    return {
      sourceQuestion: question,
      base: getSummaryBase(query),
      definition: { rows: [], columns: [], values: [] },
      outputFilters: [],
    };
  }
}
