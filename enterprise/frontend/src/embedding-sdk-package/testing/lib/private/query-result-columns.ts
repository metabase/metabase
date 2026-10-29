import { isNamedBreakout } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type {
  SchemaColumn,
  SchemaJavaScriptType,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";

import { isRecord } from "./guards";

const JAVASCRIPT_TYPES: readonly SchemaJavaScriptType[] = [
  "string",
  "number",
  "boolean",
  "Date",
  "unknown",
];

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readJavaScriptType(value: unknown): SchemaJavaScriptType | undefined {
  return JAVASCRIPT_TYPES.find((javaScriptType) => javaScriptType === value);
}

function toSchemaColumn(value: unknown): SchemaColumn | null {
  if (!isRecord(value) || typeof value.name !== "string") {
    return null;
  }

  const displayName = readString(value.displayName);
  const jsType = readJavaScriptType(value.jsType);
  const baseType = readString(value.baseType);
  const effectiveType = readString(value.effectiveType);

  return {
    name: value.name,
    ...(displayName !== undefined && { displayName }),
    ...(jsType !== undefined && { jsType }),
    ...(baseType !== undefined && { baseType }),
    ...(effectiveType !== undefined && { effectiveType }),
  };
}

function getSourceColumns(source: unknown): SchemaColumn[] {
  if (!isRecord(source)) {
    return [];
  }

  const columns = Array.isArray(source.columns)
    ? source.columns
    : Object.values(isRecord(source.fields) ? source.fields : {});

  return columns.map(toSchemaColumn).filter((column) => column !== null);
}

function getBreakoutColumn(
  breakout: unknown,
  inputColumns: readonly SchemaColumn[],
): SchemaColumn | null {
  if (isNamedBreakout(breakout)) {
    const column = getBreakoutColumn(breakout.column, inputColumns);
    return column && { ...column, name: breakout.name };
  }

  const column = toSchemaColumn(breakout);
  const inputColumn = inputColumns.find(({ name }) => name === column?.name);

  return column && { ...inputColumn, ...column };
}

function getAggregationColumn(aggregation: unknown): SchemaColumn | null {
  if (!isRecord(aggregation)) {
    return null;
  }

  const declaredColumn = toSchemaColumn(readArray(aggregation.columns)[0]);

  if (declaredColumn) {
    return declaredColumn;
  }

  const operator = readString(aggregation.operator);
  const name =
    readString(aggregation.name) ??
    (operator === "distinct" ? "count" : operator);

  return name === undefined ? null : { name, jsType: "number" };
}

function getStageColumns(
  stage: unknown,
  inputColumns: SchemaColumn[],
): SchemaColumn[] {
  if (!isRecord(stage)) {
    return inputColumns;
  }

  const breakouts = readArray(stage.breakouts);
  const aggregations = readArray(stage.aggregations);

  if (breakouts.length > 0 || aggregations.length > 0) {
    return [
      ...breakouts.map((breakout) => getBreakoutColumn(breakout, inputColumns)),
      ...aggregations.map(getAggregationColumn),
    ].filter((column) => column !== null);
  }

  const fields = readArray(stage.fields)
    .map(toSchemaColumn)
    .filter((column) => column !== null);

  return fields.length > 0 ? fields : inputColumns;
}

export function getQueryResultColumns(
  query: unknown,
  dynamicQuery: unknown,
): SchemaColumn[] {
  const sourceColumns = getSourceColumns(
    isRecord(query) ? query.source : undefined,
  );
  const queryColumns = getStageColumns(query, sourceColumns);

  return getStageColumns(dynamicQuery, queryColumns);
}
