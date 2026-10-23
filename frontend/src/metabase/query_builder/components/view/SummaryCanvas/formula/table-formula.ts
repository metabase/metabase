import { t } from "ttag";

import { CompileError } from "metabase/querying/expressions";
import { compileExpression } from "metabase/querying/expressions/compile-expression";
import { diagnoseExpression } from "metabase/querying/expressions/diagnostics/expression";
import { formatIdentifier } from "metabase/querying/expressions/identifier";
import { resolver as defaultResolver } from "metabase/querying/expressions/resolver";
import * as Lib from "metabase-lib";

const STAGE_INDEX = -1;

/** Columns a summary formula can aggregate: the source's own columns and its explicit joins. */
export function tableFormulaColumns(query: Lib.Query): Lib.ColumnMetadata[] {
  return Lib.expressionableColumns(query, STAGE_INDEX).filter((column) => {
    const info = Lib.displayInfo(query, STAGE_INDEX, column);
    return !info.isImplicitlyJoinable && !info.isAggregation;
  });
}

/** Saved metrics and measures a formula can reference, such as `[Revenue]`. */
export function tableFormulaReferences(
  query: Lib.Query,
): (Lib.MetricMetadata | Lib.MeasureMetadata)[] {
  return [
    ...Lib.availableMetrics(query, STAGE_INDEX),
    ...Lib.availableMeasures(query, STAGE_INDEX),
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
    const info = Lib.displayInfo(query, STAGE_INDEX, column);
    return [info.name, info.displayName, info.longDisplayName].some(
      (candidate) => candidate.toLowerCase() === target,
    );
  });
}

export type CompiledFormula =
  | { clause: Lib.ExpressionClause; error: null }
  | { clause: null; error: string };

/**
 * Compiles a summary formula such as `Sum([Price]) / Count()` into an
 * aggregation over `query`. Bare column references are rejected with a hint to
 * wrap them in an aggregation.
 */
export function compileFormula(
  query: Lib.Query,
  source: string,
): CompiledFormula {
  if (source.trim().length === 0) {
    return { clause: null, error: t`Enter a formula.` };
  }
  const availableColumns = tableFormulaColumns(query);
  const options = {
    query,
    stageIndex: STAGE_INDEX,
    expressionMode: "aggregation" as const,
    availableColumns,
    availableMetrics: Lib.availableMetrics(query, STAGE_INDEX),
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
  if (result.error) {
    return { clause: null, error: result.error.message };
  }
  return { clause: result.expressionClause, error: null };
}

function formatColumn(query: Lib.Query, column: Lib.ColumnMetadata) {
  return formatIdentifier(
    Lib.displayInfo(query, STAGE_INDEX, column).displayName,
  );
}

/** The formula a fresh summary starts with: a sum of the first non-ID number, or a row count. */
export function getDefaultFormula(query: Lib.Query): string {
  const column = tableFormulaColumns(query).find(
    (column) => Lib.isNumeric(column) && !Lib.isID(column),
  );
  return column ? `Sum(${formatColumn(query, column)})` : "Count()";
}

/** The formula for a column dropped on Values: a sum for numbers, a distinct count otherwise. */
export function getColumnFormula(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
): string {
  const isSummable = Lib.isNumeric(column) && !Lib.isID(column);
  return `${isSummable ? "Sum" : "Distinct"}(${formatColumn(query, column)})`;
}

/** The formula that references a saved metric or measure on its own. */
export function getReferenceFormula(
  query: Lib.Query,
  reference: Lib.MetricMetadata | Lib.MeasureMetadata,
): string {
  const { displayName } = Lib.isMetricMetadata(reference)
    ? Lib.displayInfo(query, STAGE_INDEX, reference)
    : Lib.displayInfo(query, STAGE_INDEX, reference);
  return formatIdentifier(displayName);
}
