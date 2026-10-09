import {
  type DynamicQueryInput,
  type QueryInput,
  type QuestionQueryInput,
  type TableQueryInput,
  isMeasureReference,
  isMetricReference,
  isNamedBreakout,
  isNamedField,
  isSegmentReference,
  unwrapNamedAggregation,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type {
  MetricSchema,
  QuestionSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import * as Lib from "metabase-lib";
import { isObject } from "metabase-types/guards";

// `satisfies` ties the list to the input type, so a renamed or mistyped clause
// key fails to compile instead of silently skipping its validation.
const QUESTION_QUERY_KEYS: readonly string[] = [
  "source",
  "filters",
  "aggregations",
  "breakouts",
  "orderBys",
  "limit",
  "enabled",
] satisfies readonly (keyof QuestionQueryInput)[];

const DYNAMIC_QUERY_KEYS: readonly string[] = [
  "filters",
  "aggregations",
  "breakouts",
  "orderBys",
  "limit",
  "enabled",
] satisfies readonly (keyof DynamicQueryInput)[];

export function validateQueryInput(input: QueryInput) {
  if (isQuestionQueryInput(input)) {
    validateLimit(input.limit, "Saved question query");
    validateQuestionScopedInputs(input);
    return;
  }

  validateLimit(input.limit, "Table query");
  validateTableScopedInputs(input);
}

function validateLimit(limit: number | undefined, context: string) {
  if (limit == null) {
    return;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`${context} limit must be a positive integer.`);
  }
}

function isQuestionQueryInput(input: QueryInput): input is QuestionQueryInput {
  return input.source.type === "card";
}

function validateQuestionScopedInputs(input: QuestionQueryInput) {
  const extraKeys = Object.keys(input).filter(
    (key) => !QUESTION_QUERY_KEYS.includes(key),
  );

  if (extraKeys.length > 0) {
    throw new Error(
      `Saved question queries only support ${QUESTION_QUERY_KEYS.join(
        ", ",
      )}, but received ${extraKeys.join(", ")}.`,
    );
  }

  validateResultColumnClauses(
    input,
    "Saved question query",
    (reference, context) =>
      validateQuestionResultColumn(reference, input.source, context),
  );
}

/**
 * The dynamic clauses a caller layers on top of a static query. They run as a
 * stage of their own, so they see result columns rather than the source table —
 * the same scoping a card stage has.
 */
export function validateDynamicQuery(input: DynamicQueryInput | undefined) {
  if (!input) {
    return;
  }

  const extraKeys = Object.keys(input).filter(
    (key) => !DYNAMIC_QUERY_KEYS.includes(key),
  );

  if (extraKeys.length > 0) {
    throw new Error(
      `Dynamic queries only support ${DYNAMIC_QUERY_KEYS.join(
        ", ",
      )}, but received ${extraKeys.join(", ")}.`,
    );
  }

  validateLimit(input.limit, "Dynamic query");
  validateResultColumnClauses(
    input,
    "Dynamic query",
    validateResultColumnShape,
  );
}

/**
 * Clause checks shared by every stage whose dimensions are result columns.
 * `validateDimension` supplies the part that depends on knowing those columns.
 */
function validateResultColumnClauses(
  input: DynamicQueryInput,
  label: string,
  validateDimension: (reference: unknown, context: string) => void,
) {
  input.filters?.forEach((filter) => {
    if (isSegmentReference(filter)) {
      throw new Error(
        `${label} filters cannot use Segments, which belong to a table source.`,
      );
    }

    validateDimension(getFirstOperatorArg(filter), `${label} filters`);
  });

  input.aggregations?.forEach((aggregation) => {
    const unwrapped = unwrapNamedAggregation(aggregation);
    if (isMeasureReference(unwrapped) || isMetricReference(unwrapped)) {
      throw new Error(
        `${label} aggregations cannot use Measures or Metrics, which belong to a table source.`,
      );
    }

    if (isCountAggregation(aggregation)) {
      return;
    }

    validateDimension(
      getFirstOperatorArg(aggregation),
      `${label} aggregations`,
    );
  });

  input.breakouts?.forEach((breakout) => {
    validateDimension(
      isNamedBreakout(breakout) ? breakout.column : breakout,
      `${label} breakouts`,
    );
  });

  validateOrderBys(
    input,
    `${label} orderBys`,
    (orderBy) => validateDimension(orderBy, `${label} orderBys`),
    { matchBreakoutsByName: true },
  );
}

function validateResultColumnShape(reference: unknown, context: string) {
  if (!isObject(reference) || typeof reference.name !== "string") {
    throw new Error(`${context} must reference a result column.`);
  }
}

function validateQuestionResultColumn(
  reference: unknown,
  source: QuestionSchema,
  context: string,
) {
  const columnName = isObject(reference) ? reference.name : undefined;

  if (typeof columnName !== "string") {
    throw new Error(
      `${context} must reference a result column of the saved question.`,
    );
  }

  // Id-only question references (`{ type: "card", id }`) carry no result
  // metadata, so the column can only be resolved while the query is built.
  if (!source.columns) {
    return;
  }

  if (!source.columns.some(({ name }) => name === columnName)) {
    throw new Error(
      `${context} must reference a result column of saved question ${source.id}, but received ${columnName}.`,
    );
  }
}

function validateTableScopedInputs(input: TableQueryInput) {
  const tableId = input.source.id;

  input.fields?.forEach((field) => {
    validateGeneratedTableReference(
      isNamedField(field) ? field.column : field,
      tableId,
      "Table query fields",
    );
  });

  input.filters?.forEach((filter) => {
    if (isTableScopedReference(filter)) {
      validateGeneratedTableReference(filter, tableId, "Table query filters");
      return;
    }

    validateGeneratedTableReference(
      getFirstOperatorArg(filter),
      tableId,
      "Table query filters",
    );
  });

  input.aggregations?.map(unwrapNamedAggregation).forEach((aggregation) => {
    if (isMetricReference(aggregation)) {
      validateMetricAggregation(aggregation, tableId);
      return;
    }

    if (isTableScopedReference(aggregation)) {
      validateGeneratedTableReference(
        aggregation,
        tableId,
        "Table query aggregations",
      );
      return;
    }

    validateGeneratedTableReference(
      getFirstOperatorArg(aggregation),
      tableId,
      "Table query aggregations",
    );
  });

  input.breakouts?.forEach((breakout) => {
    validateGeneratedTableReference(
      isNamedBreakout(breakout) ? breakout.column : breakout,
      tableId,
      "Table query breakouts",
    );
  });

  validateOrderBys(input, "Table query orderBys", (orderBy) =>
    validateGeneratedTableReference(orderBy, tableId, "Table query orderBys"),
  );
}

function validateOrderBys(
  input: GroupedQueryClauses,
  context: string,
  validateDimension: (orderBy: unknown) => void,
  { matchBreakoutsByName = false } = {},
) {
  input.orderBys?.forEach((orderBy) => {
    if (isAggregationResultReference(input.aggregations, orderBy)) {
      return;
    }

    if (
      isGroupedQuery(input) &&
      !isBreakoutReference(input.breakouts, orderBy, matchBreakoutsByName)
    ) {
      throw new Error(
        `${context} for grouped queries must use query breakouts or aggregations included in the query.`,
      );
    }

    validateDimension(orderBy);
  });
}

function validateGeneratedTableReference(
  reference: unknown,
  expectedTableId: number,
  context: string,
) {
  const actualTableId = getTableId(reference);

  if (actualTableId == null || actualTableId === expectedTableId) {
    return;
  }

  if (getSourceFieldId(reference) != null) {
    return;
  }

  throw new Error(
    `${context} must belong to source table ${expectedTableId}, but received table id ${actualTableId}.`,
  );
}

function isTableScopedReference(value: unknown): value is { tableId?: number } {
  return isObject(value) && "tableId" in value;
}

function getFirstOperatorArg(value: unknown) {
  if (
    !isObject(value) ||
    value.type !== "operator" ||
    !Array.isArray(value.args)
  ) {
    return undefined;
  }

  return value.args[0];
}

function isCountAggregation(value: unknown) {
  return (
    isObject(value) &&
    value.type === "operator" &&
    value.operator === "count" &&
    Array.isArray(value.args) &&
    value.args.length === 0
  );
}

type GroupingClauses = {
  aggregations?: readonly unknown[];
  breakouts?: readonly unknown[];
};

type GroupedQueryClauses = GroupingClauses & {
  orderBys?: readonly unknown[];
};

// Only aggregations and breakouts group a query; `orderBy` is not.
function isGroupedQuery(input: GroupingClauses) {
  return Boolean(input.aggregations?.length || input.breakouts?.length);
}

function isAggregationResultReference(
  aggregations: readonly unknown[] | undefined,
  value: unknown,
) {
  if (
    !isObject(value) ||
    value.type !== "column" ||
    typeof value.name !== "string"
  ) {
    return false;
  }

  return getAggregationResultColumnNames(aggregations).includes(value.name);
}

function getAggregationResultColumnNames(
  aggregations: readonly unknown[] | undefined,
) {
  return (aggregations ?? []).flatMap((aggregation) => {
    // Metrics and Measures also carry a `name`, but it is their title, not a
    // result column name.
    if (
      isObject(aggregation) &&
      aggregation.type === "operator" &&
      typeof aggregation.name === "string"
    ) {
      return [aggregation.name];
    }

    if (isCountAggregation(aggregation)) {
      return ["count"];
    }

    const columns = getColumns(aggregation);

    if (!columns) {
      return [];
    }

    return columns.flatMap((column) =>
      isObject(column) && typeof column.name === "string" ? [column.name] : [],
    );
  });
}

function getColumns(value: unknown) {
  if (!isObject(value) || !("columns" in value)) {
    return null;
  }

  return Array.isArray(value.columns) ? value.columns : null;
}

function isBreakoutReference(
  breakouts: readonly unknown[] | undefined,
  value: unknown,
  matchByName: boolean,
) {
  if (!isObject(value)) {
    return false;
  }

  return (breakouts ?? []).some((breakout) => {
    if (isNamedBreakout(breakout) && breakout.name === value.name) {
      return true;
    }

    const column = isNamedBreakout(breakout) ? breakout.column : breakout;

    return (
      (matchByName ? namesMatch(column, value) : fieldsMatch(column, value)) &&
      bucketOptionsMatch(column, value)
    );
  });
}

function getTableId(value: unknown): number | undefined {
  if (!isTableScopedReference(value) || typeof value.tableId !== "number") {
    return undefined;
  }

  return value.tableId;
}

function getSourceFieldId(value: unknown): number | undefined {
  if (!isObject(value) || typeof value.sourceFieldId !== "number") {
    return undefined;
  }

  return value.sourceFieldId;
}

function validateMetricAggregation(metric: MetricSchema, tableId: number) {
  // Source-card Metrics need query composition over saved-question sources so
  // Lib can scope metric dimensions to the card stage. Saved-question sources
  // currently support source-only shortcuts, so reject source-card Metrics here.
  if (metric.sourceCardId != null) {
    throw new Error(
      "Table query metric aggregations cannot use source-card Metrics. Use a saved question source for source-card Metrics.",
    );
  }

  const allowedTableIds = getMetricAllowedTableIds(metric);

  if (allowedTableIds === null) {
    throw new Error(
      "Table query metric aggregations must include source table metadata.",
    );
  }

  if (allowedTableIds.includes(tableId)) {
    return;
  }

  throw new Error(
    `Table query metric aggregations must belong to source table ${tableId}, but received mapped table ids ${allowedTableIds.join(
      ", ",
    )}.`,
  );
}

function getMetricAllowedTableIds(metric: MetricSchema) {
  if (metric.mappedTableIds?.length) {
    return metric.mappedTableIds;
  }

  if (metric.sourceTableId != null) {
    return [metric.sourceTableId];
  }

  return null;
}

const namesMatch = (left: unknown, right: Record<string, unknown>) =>
  isObject(left) && left.name === right.name;

function fieldsMatch(left: unknown, right: Record<string, unknown>) {
  if (!isObject(left)) {
    return false;
  }

  const leftTableId = getTableId(left);
  const rightTableId = getTableId(right);
  const leftFieldId = typeof left.fieldId === "number" ? left.fieldId : null;
  const rightFieldId = typeof right.fieldId === "number" ? right.fieldId : null;
  const leftSourceFieldId = getSourceFieldId(left);
  const rightSourceFieldId = getSourceFieldId(right);

  return (
    leftTableId === rightTableId &&
    leftSourceFieldId === rightSourceFieldId &&
    ((leftFieldId != null && leftFieldId === rightFieldId) ||
      left.name === right.name)
  );
}

function bucketOptionsMatch(left: unknown, right: Record<string, unknown>) {
  if (!isObject(left)) {
    return false;
  }

  return (
    left.unit === right.unit && binningOptionsMatch(left.binning, right.binning)
  );
}

function binningOptionsMatch(left: unknown, right: unknown) {
  if (left == null || right == null) {
    return left == null && right == null;
  }

  if (!isObject(left) || !isObject(right)) {
    return false;
  }

  return (
    left.strategy === right.strategy &&
    left.numBins === right.numBins &&
    left.binWidth === right.binWidth
  );
}

type StageColumnName = {
  name: string;
  displayName: string;
};

function stageColumnNames(
  query: Lib.Query,
  stageIndex: number,
): StageColumnName[] {
  const fields = Lib.fields(query, stageIndex).map((field) => {
    const { name, displayName } = Lib.displayInfo(query, stageIndex, field);
    return { name, displayName };
  });
  const breakouts = Lib.breakouts(query, stageIndex).reduce<StageColumnName[]>(
    (columns, breakout) => {
      const column = Lib.breakoutColumn(query, stageIndex, breakout);

      if (column) {
        const { name, displayName } = Lib.displayInfo(
          query,
          stageIndex,
          column,
        );
        columns.push({ name, displayName });
      }

      return columns;
    },
    [],
  );
  const aggregations = Lib.aggregations(query, stageIndex).map(
    (aggregation) => ({
      name: Lib.displayInfo(
        query,
        stageIndex,
        Lib.aggregationColumn(query, stageIndex, aggregation),
      ).name,
      displayName: Lib.displayInfo(query, stageIndex, aggregation).displayName,
    }),
  );

  return [...fields, ...breakouts, ...aggregations];
}

function stageConflicts(query: Lib.Query, stageIndex: number): string[] {
  const byName = new Map<string, StageColumnName[]>();
  stageColumnNames(query, stageIndex).forEach((column) => {
    byName.set(column.name, [...(byName.get(column.name) ?? []), column]);
  });

  return [...byName]
    .filter(([, columns]) => columns.length > 1)
    .map(
      ([name, columns]) =>
        `${columns.map((column) => column.displayName).join(", ")} share the column name "${name}"`,
    );
}

export function validateUniqueColumnNames(query: Lib.Query) {
  const conflicts = Lib.stageIndexes(query).flatMap((stageIndex) =>
    stageConflicts(query, stageIndex),
  );

  if (conflicts.length > 0) {
    throw new Error(
      `Fields, breakouts and aggregations need unique column names: ${conflicts.join("; ")}. Name them apart with the \`name\` option of \`field\`, of \`breakout\` or of an aggregation helper, or with \`aggregations.measure\` or \`aggregations.metric\` for a measure or metric.`,
    );
  }
}
