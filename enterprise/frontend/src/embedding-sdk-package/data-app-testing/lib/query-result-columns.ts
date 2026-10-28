import type {
  SchemaColumn,
  SchemaJavaScriptType,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";

const JAVASCRIPT_TYPES: readonly SchemaJavaScriptType[] = [
  "string",
  "number",
  "boolean",
  "Date",
  "unknown",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const readJavaScriptType = (value: unknown): SchemaJavaScriptType | undefined =>
  JAVASCRIPT_TYPES.find((javaScriptType) => javaScriptType === value);

const toSchemaColumn = (value: unknown): SchemaColumn | null => {
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
};

const getSourceColumns = (source: unknown): SchemaColumn[] => {
  if (!isRecord(source)) {
    return [];
  }

  const columns = Array.isArray(source.columns)
    ? source.columns
    : Object.values(isRecord(source.fields) ? source.fields : {});

  return columns.map(toSchemaColumn).filter((column) => column !== null);
};

const getBreakoutColumn = (
  breakout: unknown,
  inputColumns: readonly SchemaColumn[],
): SchemaColumn | null => {
  if (
    isRecord(breakout) &&
    breakout.type === "breakout" &&
    typeof breakout.name === "string"
  ) {
    const column = getBreakoutColumn(breakout.column, inputColumns);
    return column && { ...column, name: breakout.name };
  }

  const column = toSchemaColumn(breakout);
  const inputColumn = inputColumns.find(({ name }) => name === column?.name);

  return column && { ...inputColumn, ...column };
};

const getAggregationColumn = (aggregation: unknown): SchemaColumn | null => {
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
};

const getStageColumns = (
  stage: unknown,
  inputColumns: SchemaColumn[],
): SchemaColumn[] => {
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
};

export const getQueryResultColumns = (
  query: unknown,
  dynamicQuery: unknown,
): SchemaColumn[] => {
  const sourceColumns = getSourceColumns(
    isRecord(query) ? query.source : undefined,
  );
  const queryColumns = getStageColumns(query, sourceColumns);

  return getStageColumns(dynamicQuery, queryColumns);
};
