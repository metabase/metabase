import {
  diagnoseAndCompile,
  formatIdentifier,
} from "metabase/querying/expressions";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";
import type {
  Database,
  SuggestSummaryFormulaRequest,
} from "metabase-types/api";

import type { SummaryWellId } from "./types";

export const MAX_FORMULA_PROMPT_LENGTH = 500;
const MAX_FORMULA_REFERENCES = 200;
const MAX_FORMULA_REFERENCE_LENGTH = 255;

type FormulaMode = SuggestSummaryFormulaRequest["mode"];

export type FormulaReferences = Pick<
  SuggestSummaryFormulaRequest,
  "columns" | "metrics" | "measures" | "table_name" | "database_id"
>;

export function getFormulaMode(wellId: SummaryWellId): FormulaMode {
  return wellId === "values" ? "aggregation" : "expression";
}

function getFormulaColumns(
  query: Lib.Query,
  stageIndex: number,
  mode: FormulaMode,
): Lib.ColumnMetadata[] {
  return mode === "aggregation"
    ? Lib.aggregableColumns(query, stageIndex)
    : Lib.expressionableColumns(query, stageIndex);
}

function getFormulaMetrics(
  query: Lib.Query,
  stageIndex: number,
  mode: FormulaMode,
): Lib.MetricMetadata[] | undefined {
  return mode === "aggregation"
    ? Lib.availableMetrics(query, stageIndex)
    : undefined;
}

function getColumnType(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return "boolean";
  }
  if (Lib.isNumeric(column)) {
    return "number";
  }
  if (Lib.isTemporal(column)) {
    return "date";
  }
  if (Lib.isStringOrStringLike(column)) {
    return "text";
  }
  return null;
}

function toReference(name: string): string | null {
  const reference = formatIdentifier(name);
  return name.trim().length > 0 &&
    reference.length <= MAX_FORMULA_REFERENCE_LENGTH
    ? reference
    : null;
}

function getTableName(query: Lib.Query, stageIndex: number) {
  const tableId = Lib.primarySourceTableId(query);
  const table =
    tableId != null ? Lib.tableOrCardMetadata(query, tableId) : null;
  const name = table
    ? Lib.displayInfo(query, stageIndex, table).displayName.trim()
    : "";
  return name.length > 0 && name.length <= MAX_FORMULA_REFERENCE_LENGTH
    ? name
    : null;
}

/**
 * The names a generated formula for a well can reference, formatted the way the formula editor
 * writes them. Lists are capped at the size the summary-formula endpoint accepts, and names it
 * would reject are left out.
 *
 * Returns `null` when the endpoint would reject any request from this query: there's no database,
 * or nothing the formula could reference.
 */
export function getFormulaReferences(
  query: Lib.Query,
  stageIndex: number,
  mode: FormulaMode,
): FormulaReferences | null {
  const databaseId = Lib.databaseID(query);
  if (databaseId == null) {
    return null;
  }
  const columns = getFormulaColumns(query, stageIndex, mode)
    .flatMap((column) => {
      const name = toReference(
        Lib.displayInfo(query, stageIndex, column).longDisplayName,
      );
      return name ? [{ name, type: getColumnType(column) }] : [];
    })
    .slice(0, MAX_FORMULA_REFERENCES);
  const aggregations =
    mode === "aggregation"
      ? {
          metrics: getAggregationReferences(
            Lib.availableMetrics(query, stageIndex).map(
              (metric) =>
                Lib.displayInfo(query, stageIndex, metric).displayName,
            ),
          ),
          measures: getAggregationReferences(
            Lib.availableMeasures(query, stageIndex).map(
              (measure) =>
                Lib.displayInfo(query, stageIndex, measure).displayName,
            ),
          ),
        }
      : { metrics: [], measures: [] };
  const hasReferences =
    columns.length > 0 ||
    aggregations.metrics.length > 0 ||
    aggregations.measures.length > 0;
  if (!hasReferences) {
    return null;
  }
  return {
    columns,
    ...aggregations,
    table_name: getTableName(query, stageIndex),
    database_id: databaseId,
  };
}

function getAggregationReferences(names: string[]): string[] {
  return names
    .flatMap((name) => {
      const reference = toReference(name);
      return reference ? [reference] : [];
    })
    .slice(0, MAX_FORMULA_REFERENCES);
}

/** The summary-formula request for `prompt`, typed into a well in `mode`. */
export function getFormulaRequest(
  references: FormulaReferences,
  prompt: string,
  mode: FormulaMode,
): SuggestSummaryFormulaRequest {
  return {
    ...references,
    mode,
    prompt: prompt.trim().slice(0, MAX_FORMULA_PROMPT_LENGTH),
  };
}

/** Compiles a generated formula against what the formula editor offers in `mode`. */
export function compileFormula(
  query: Lib.Query,
  stageIndex: number,
  mode: FormulaMode,
  source: string,
  database: Pick<Database, "features"> | undefined,
): ReturnType<typeof diagnoseAndCompile> {
  return diagnoseAndCompile({
    source,
    expressionMode: mode,
    query,
    stageIndex,
    database,
    availableColumns: getFormulaColumns(query, stageIndex, mode),
    availableMetrics: getFormulaMetrics(query, stageIndex, mode),
  });
}

/**
 * Adds a compiled formula to a well: a named aggregation to Summarize by, or a custom column
 * grouped by in Group by.
 */
export function addFormula(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
  name: string,
  clause: Lib.ExpressionClause,
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
