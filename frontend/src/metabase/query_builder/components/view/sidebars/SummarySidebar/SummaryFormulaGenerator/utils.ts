import { match } from "ts-pattern";
import { t } from "ttag";

import { getFormulaColumns } from "metabase/querying/components/FormulaEditor";
import {
  diagnoseAndCompile,
  formatIdentifier,
} from "metabase/querying/expressions";
import * as Lib from "metabase-lib";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isa } from "metabase-lib/v1/types/utils/isa";
import type {
  Database,
  GenerateCustomExpressionReference,
  GenerateCustomExpressionRequest,
} from "metabase-types/api";

import type { SummaryWellId } from "../types";

export const MAX_FORMULA_PROMPT_LENGTH = 500;
const MAX_FORMULA_REFERENCES = 200;
const MAX_FORMULA_REFERENCE_LENGTH = 256;
const MAX_GENERATE_ERROR_MESSAGE_LENGTH = 200;

type FormulaColumnType = "boolean" | "number" | "datetime" | "string";

type FormulaReferenceKind = "column" | "metric" | "measure";

type FormulaReferenceDisplayInfo = (
  | Lib.MetricDisplayInfo
  | Lib.MeasureDisplayInfo
) & {
  effectiveType?: string;
};

type FormulaRequestResult =
  | {
      status: "ok";
      request: Omit<GenerateCustomExpressionRequest, "metabot_id">;
    }
  | { status: "error"; message: string };

/**
 * Caps a generation error message at a readable length, so a proxy's error page doesn't flood the dropdown.
 */
export function truncateGenerateErrorMessage(message: string): string {
  return message.length > MAX_GENERATE_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_GENERATE_ERROR_MESSAGE_LENGTH).trimEnd()}…`
    : message;
}

export function getFormulaMode(
  wellId: SummaryWellId,
): GenerateCustomExpressionRequest["mode"] {
  return wellId === "values" ? "aggregation" : "expression";
}

function getColumnType(column: Lib.ColumnMetadata): FormulaColumnType | null {
  if (Lib.isBoolean(column)) {
    return "boolean";
  }
  if (Lib.isNumeric(column)) {
    return "number";
  }
  if (Lib.isTemporal(column)) {
    return "datetime";
  }
  if (Lib.isStringOrStringLike(column)) {
    return "string";
  }
  return null;
}

function getEffectiveTypeCategory(
  effectiveType: string | undefined,
): FormulaColumnType | null {
  if (isa(effectiveType, TYPE.Boolean)) {
    return "boolean";
  }
  if (isa(effectiveType, TYPE.Number)) {
    return "number";
  }
  if (isa(effectiveType, TYPE.Temporal)) {
    return "datetime";
  }
  if (isa(effectiveType, TYPE.Text) || isa(effectiveType, TYPE.TextLike)) {
    return "string";
  }
  return null;
}

function toReference(name: string): string | null {
  return name.trim().length > 0 ? formatIdentifier(name) : null;
}

function toReferences(
  displayInfos: FormulaReferenceDisplayInfo[],
): GenerateCustomExpressionReference[] {
  return displayInfos.flatMap(({ displayName, effectiveType }) => {
    const name = toReference(displayName);
    return name
      ? [{ name, type: getEffectiveTypeCategory(effectiveType) }]
      : [];
  });
}

function getTooManyReferencesMessage(kind: FormulaReferenceKind): string {
  return match(kind)
    .with(
      "column",
      () =>
        t`AI generation isn't available because there are more than ${MAX_FORMULA_REFERENCES} columns.`,
    )
    .with(
      "metric",
      () =>
        t`AI generation isn't available because there are more than ${MAX_FORMULA_REFERENCES} metrics.`,
    )
    .with(
      "measure",
      () =>
        t`AI generation isn't available because there are more than ${MAX_FORMULA_REFERENCES} measures.`,
    )
    .exhaustive();
}

function getReferenceTooLongMessage(kind: FormulaReferenceKind): string {
  return match(kind)
    .with(
      "column",
      () =>
        t`AI generation isn't available because a column name is longer than ${MAX_FORMULA_REFERENCE_LENGTH} characters.`,
    )
    .with(
      "metric",
      () =>
        t`AI generation isn't available because a metric name is longer than ${MAX_FORMULA_REFERENCE_LENGTH} characters.`,
    )
    .with(
      "measure",
      () =>
        t`AI generation isn't available because a measure name is longer than ${MAX_FORMULA_REFERENCE_LENGTH} characters.`,
    )
    .exhaustive();
}

function getReferencesError(
  references: GenerateCustomExpressionReference[],
  kind: FormulaReferenceKind,
): string | null {
  if (references.length > MAX_FORMULA_REFERENCES) {
    return getTooManyReferencesMessage(kind);
  }
  const isAnyTooLong = references.some(
    ({ name }) => name.length > MAX_FORMULA_REFERENCE_LENGTH,
  );
  return isAnyTooLong ? getReferenceTooLongMessage(kind) : null;
}

function getTableName(query: Lib.Query, stageIndex: number): string | null {
  const tableId = Lib.primarySourceTableId(query);
  const table =
    tableId != null ? Lib.tableOrCardMetadata(query, tableId) : null;
  const name = table
    ? Lib.displayInfo(query, stageIndex, table).displayName.trim()
    : "";
  return name.length > 0 ? name : null;
}

/**
 * Builds the request params for a `GenerateCustomExpressionRequest`. Columns, metrics and measures are named the way
 * the formula editor references them.
 *
 * Returns an error with a message for the user when the endpoint would reject the request: the query has no
 * database or nothing a formula could reference, or the prompt or what it references exceeds the endpoint's limits.
 */
export function getFormulaRequest(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
  prompt: string,
): FormulaRequestResult {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length > MAX_FORMULA_PROMPT_LENGTH) {
    return {
      status: "error",
      message: t`AI generation isn't available because the description is longer than ${MAX_FORMULA_PROMPT_LENGTH} characters.`,
    };
  }
  const mode = getFormulaMode(wellId);
  const databaseId = Lib.databaseID(query);
  if (databaseId == null) {
    return { status: "error", message: getNoReferencesMessage(mode) };
  }
  const columns = getFormulaColumns(query, stageIndex, mode).flatMap(
    (column) => {
      const name = toReference(
        Lib.displayInfo(query, stageIndex, column).longDisplayName,
      );
      return name ? [{ name, type: getColumnType(column) }] : [];
    },
  );
  const isAggregation = mode === "aggregation";
  const metrics = isAggregation
    ? toReferences(
        Lib.availableMetrics(query, stageIndex).map((metric) =>
          Lib.displayInfo(query, stageIndex, metric),
        ),
      )
    : [];
  const measures = isAggregation
    ? toReferences(
        Lib.availableMeasures(query, stageIndex).map((measure) =>
          Lib.displayInfo(query, stageIndex, measure),
        ),
      )
    : [];
  const referencesError =
    getReferencesError(columns, "column") ??
    getReferencesError(metrics, "metric") ??
    getReferencesError(measures, "measure");
  if (referencesError != null) {
    return { status: "error", message: referencesError };
  }
  const hasReferences =
    columns.length > 0 || metrics.length > 0 || measures.length > 0;
  if (!hasReferences) {
    return { status: "error", message: getNoReferencesMessage(mode) };
  }
  const tableName = getTableName(query, stageIndex);
  if (tableName != null && tableName.length > MAX_FORMULA_REFERENCE_LENGTH) {
    return {
      status: "error",
      message: t`AI generation isn't available because the table name is longer than ${MAX_FORMULA_REFERENCE_LENGTH} characters.`,
    };
  }
  return {
    status: "ok",
    request: {
      mode,
      prompt: trimmedPrompt,
      columns,
      metrics,
      measures,
      table_name: tableName,
      database_id: databaseId,
    },
  };
}

function getNoReferencesMessage(mode: Lib.ExpressionMode): string {
  return mode === "aggregation"
    ? t`There are no columns, metrics or measures a formula could use.`
    : t`There are no columns a formula could use.`;
}

/** Compiles a generated formula against what the formula editor offers in the well. */
export function compileFormula(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
  source: string,
  database: Database | undefined,
) {
  const mode = getFormulaMode(wellId);
  return diagnoseAndCompile({
    source,
    expressionMode: mode,
    query,
    stageIndex,
    database,
    availableColumns: getFormulaColumns(query, stageIndex, mode),
    availableMetrics:
      mode === "aggregation"
        ? Lib.availableMetrics(query, stageIndex)
        : undefined,
  });
}
