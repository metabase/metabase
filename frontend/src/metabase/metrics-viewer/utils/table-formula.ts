import { t } from "ttag";

import { CompileError } from "metabase/querying/expressions";
import { compileExpression } from "metabase/querying/expressions/compile-expression";
import { diagnoseExpression } from "metabase/querying/expressions/diagnostics/expression";
import { resolver as defaultResolver } from "metabase/querying/expressions/resolver";
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

/** Saved metrics and measures a formula can reference, such as `[Revenue]`. */
export function tableFormulaReferences(
  query: Lib.Query,
): (Lib.MetricMetadata | Lib.MeasureMetadata)[] {
  return [
    ...Lib.availableMetrics(query, -1),
    ...Lib.availableMeasures(query, -1),
  ];
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

type CompiledFormula =
  | { clause: Lib.ExpressionClause; error: null }
  | { clause: null; error: string };

/** Compiles one aggregation formula over the query's own columns and metrics. */
export function compileTableFormula(
  query: Lib.Query,
  source: string,
): CompiledFormula {
  const availableColumns = tableFormulaColumns(query);
  const options = {
    query,
    stageIndex: -1,
    expressionMode: "aggregation" as const,
    availableColumns,
    availableMetrics: Lib.availableMetrics(query, -1),
  };
  const resolveReference = defaultResolver(options);
  const result = compileExpression({
    ...options,
    source,
    resolver: (type, name, node) => {
      const column = findFormulaColumn(query, availableColumns, name);
      if (type === "aggregation") {
        try {
          return resolveReference(type, name, node);
        } catch (error) {
          if (column) {
            throw new CompileError(
              t`Use an aggregation such as SUM(${name}).`,
              node,
            );
          }
          throw error;
        }
      }
      if (!column) {
        throw new CompileError(t`Unknown column: ${name}`, node);
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
  return result.error
    ? { clause: null, error: result.error.message }
    : { clause: result.expressionClause, error: null };
}

export function applyTableFormula(
  query: Lib.Query,
  source: string,
  aggregationIndex = 0,
) {
  const result = compileTableFormula(query, source);
  if (!result.clause) {
    return { query: null, error: result.error };
  }
  const previous = Lib.aggregations(query, -1)[aggregationIndex];
  return {
    query: previous
      ? Lib.replaceClause(query, -1, previous, result.clause)
      : Lib.aggregate(query, -1, result.clause),
    error: null,
  };
}

/**
 * Splits a list of formulas on top-level commas, the way the metric explorer's
 * bar separates items. Commas inside calls, brackets or strings are kept.
 */
export function splitFormulaList(source: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === "\\") {
        index++;
      } else if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth++;
    } else if (char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
    } else if (char === "," && depth === 0) {
      segments.push(source.slice(start, index));
      start = index + 1;
    }
  }
  segments.push(source.slice(start));
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

/**
 * Replaces every calculation with the comma-separated formulas in `source`.
 * Reports the first formula that doesn't compile, by position.
 */
export function applyTableFormulaList(query: Lib.Query, source: string) {
  const formulas = splitFormulaList(source);
  if (formulas.length === 0) {
    return { query: null, error: t`Add at least one calculation.` };
  }
  const base = Lib.aggregations(query, -1).reduce(
    (nextQuery, aggregation) => Lib.removeClause(nextQuery, -1, aggregation),
    query,
  );
  let nextQuery = base;
  for (const [index, formula] of formulas.entries()) {
    const result = compileTableFormula(base, formula);
    if (!result.clause) {
      const error =
        formulas.length > 1
          ? t`Calculation ${index + 1}: ${result.error}`
          : result.error;
      return { query: null, error };
    }
    nextQuery = Lib.aggregate(nextQuery, -1, result.clause);
  }
  return { query: nextQuery, error: null };
}
