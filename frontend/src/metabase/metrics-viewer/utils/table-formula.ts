import { t } from "ttag";

import { CompileError } from "metabase/querying/expressions";
import { compileExpression } from "metabase/querying/expressions/compile-expression";
import { diagnoseExpression } from "metabase/querying/expressions/diagnostics/expression";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export function tableFormulaColumns(query: Lib.Query) {
  return Lib.expressionableColumns(query, -1).filter((column) => {
    const info = Lib.displayInfo(query, -1, column);
    return (
      !info.isFromJoin && !info.isImplicitlyJoinable && !info.isAggregation
    );
  });
}

/** Matches a typed column reference by name or display name, ignoring case. */
export function findFormulaColumn(
  query: Lib.Query,
  columns: readonly Lib.ColumnMetadata[],
  name: string,
): Lib.ColumnMetadata | undefined {
  const target = name.toLowerCase();
  return columns.find((column) => {
    const info = Lib.displayInfo(query, -1, column);
    return [info.name, info.displayName, info.longDisplayName].some(
      (candidate) => candidate.toLowerCase() === target,
    );
  });
}

export function initializeTableSummary(question: Question): Question {
  const query = question.query();
  if (Lib.aggregations(query, -1).length) {
    return question;
  }
  const column = tableFormulaColumns(query).find(
    (column) => Lib.isNumeric(column) && !Lib.isID(column),
  );
  const aggregation = column
    ? Lib.expressionClause({ operator: "sum", options: {}, args: [column] })
    : Lib.expressionClause({ operator: "count", options: {}, args: [] });
  return question
    .setQuery(Lib.aggregate(query, -1, aggregation))
    .setDisplay("table");
}

export function applyTableFormula(
  query: Lib.Query,
  source: string,
  aggregationIndex = 0,
) {
  const availableColumns = tableFormulaColumns(query);
  const options = {
    query,
    stageIndex: -1,
    expressionMode: "aggregation" as const,
    availableColumns,
    availableMetrics: [],
  };
  const result = compileExpression({
    ...options,
    source,
    resolver: (type, name, node) => {
      const column = findFormulaColumn(query, availableColumns, name);
      if (!column) {
        throw new CompileError(t`Unknown column: ${name}`, node);
      }
      if (type === "aggregation") {
        throw new CompileError(
          t`Use an aggregation such as SUM(${name}).`,
          node,
        );
      }
      return column;
    },
    hooks: {
      compiled({ expressionClause, expressionParts }) {
        diagnoseExpression({ ...options, expressionClause, expressionParts });
      },
      error(error) {
        throw error;
      },
    },
  });
  if (result.error) {
    return { query: null, error: result.error.message };
  }
  const previous = Lib.aggregations(query, -1)[aggregationIndex];
  return {
    query: previous
      ? Lib.replaceClause(query, -1, previous, result.expressionClause)
      : Lib.aggregate(query, -1, result.expressionClause),
    error: null,
  };
}
