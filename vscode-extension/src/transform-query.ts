export interface TableReference {
  display: string;
  ref: string[];
}

export interface FieldReference {
  display: string;
  ref: string[];
}

export interface NativeTransformQuery {
  type: "native";
  database: string;
  sql: string;
}

export interface StructuredTransformQuery {
  type: "structured";
  database: string;
  sourceTable: TableReference;
  filters: { operator: string; column: FieldReference; value: string }[];
  aggregations: { operator: string; column: FieldReference | null }[];
  breakouts: FieldReference[];
  orderBy: { column: FieldReference; direction: string }[];
  limit: number | null;
}

export type TransformQuery = NativeTransformQuery | StructuredTransformQuery;

export interface TransformTarget {
  database: string;
  schema: string;
  name: string;
}

export function parseTransformQuery(
  raw: Record<string, unknown>,
): TransformQuery | null {
  const source = raw.source as Record<string, unknown> | undefined;
  if (!source) return null;

  const queryWrapper = source.query as Record<string, unknown> | undefined;
  if (!queryWrapper) return null;

  const database = String(queryWrapper.database ?? "unknown");

  if (queryWrapper.type === "native") {
    const native = queryWrapper.native as Record<string, unknown> | undefined;
    return {
      type: "native",
      database,
      sql: String(native?.query ?? ""),
    };
  }

  if (queryWrapper.type === "query") {
    const query = queryWrapper.query as Record<string, unknown> | undefined;
    if (!query) return null;

    return {
      type: "structured",
      database,
      sourceTable: formatSourceTable(query["source-table"]),
      filters: parseFilters(query.filter),
      aggregations: parseAggregations(query.aggregation),
      breakouts: parseBreakouts(query.breakout),
      orderBy: parseOrderBy(query["order-by"]),
      limit: typeof query.limit === "number" ? query.limit : null,
    };
  }

  return null;
}

export function parseTransformTarget(
  raw: Record<string, unknown>,
): TransformTarget | null {
  const target = raw.target as Record<string, unknown> | undefined;
  if (!target) return null;

  return {
    database: String(target.database ?? ""),
    schema: String(target.schema ?? ""),
    name: String(target.name ?? ""),
  };
}

function formatSourceTable(sourceTable: unknown): TableReference {
  if (Array.isArray(sourceTable)) {
    const ref = sourceTable.map(String);
    if (ref.length >= 3) {
      return { display: `${ref[1]}.${ref[2]}`, ref: ref.slice(0, 3) };
    }
    return { display: ref.join("."), ref };
  }
  const display = String(sourceTable ?? "unknown");
  return { display, ref: [] };
}

function extractFieldReference(fieldRef: unknown): FieldReference {
  if (!Array.isArray(fieldRef)) {
    return { display: String(fieldRef ?? "?"), ref: [] };
  }

  // ["field", [db, schema, table, column], opts]
  if (fieldRef[0] === "field" && Array.isArray(fieldRef[1])) {
    const parts = fieldRef[1].map(String);
    if (parts.length >= 4) {
      return { display: parts[3], ref: parts };
    }
    return { display: parts.join("."), ref: parts };
  }

  // ["field", columnName, opts]
  if (fieldRef[0] === "field" && typeof fieldRef[1] === "string") {
    return { display: fieldRef[1], ref: [] };
  }

  return { display: String(fieldRef), ref: [] };
}

function formatFilterValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

function parseFilters(
  filter: unknown,
): { operator: string; column: FieldReference; value: string }[] {
  if (!Array.isArray(filter)) return [];

  if (
    typeof filter[0] === "string" &&
    filter[0] !== "and" &&
    filter[0] !== "or"
  ) {
    const parsed = parseSingleFilter(filter);
    return parsed ? [parsed] : [];
  }

  if (filter[0] === "and" || filter[0] === "or") {
    return filter
      .slice(1)
      .map((subFilter: unknown) =>
        Array.isArray(subFilter) ? parseSingleFilter(subFilter) : null,
      )
      .filter(
        (
          result,
        ): result is { operator: string; column: FieldReference; value: string } =>
          result !== null,
      );
  }

  return [];
}

function parseSingleFilter(
  filter: unknown[],
): { operator: string; column: FieldReference; value: string } | null {
  if (filter.length < 3) return null;

  const operator = String(filter[0]);
  const column = extractFieldReference(filter[1]);
  const value = formatFilterValue(filter[2]);

  return { operator, column, value };
}

function parseAggregations(
  aggregation: unknown,
): { operator: string; column: FieldReference | null }[] {
  if (!Array.isArray(aggregation)) return [];

  if (typeof aggregation[0] === "string") {
    return [parseSingleAggregation(aggregation)];
  }

  return aggregation
    .filter(Array.isArray)
    .map((agg: unknown[]) => parseSingleAggregation(agg));
}

function parseSingleAggregation(aggregation: unknown[]): {
  operator: string;
  column: FieldReference | null;
} {
  const operator = String(aggregation[0]);
  const column =
    aggregation.length > 1 ? extractFieldReference(aggregation[1]) : null;
  return { operator, column };
}

function parseBreakouts(breakout: unknown): FieldReference[] {
  if (!Array.isArray(breakout)) return [];
  return breakout.map((item: unknown) => {
    if (Array.isArray(item)) return extractFieldReference(item);
    return { display: String(item), ref: [] };
  });
}

function parseOrderBy(
  orderBy: unknown,
): { column: FieldReference; direction: string }[] {
  if (!Array.isArray(orderBy)) return [];

  return orderBy.filter(Array.isArray).map((clause: unknown[]) => {
    const direction = String(clause[0] ?? "asc");
    const column =
      clause.length > 1
        ? extractFieldReference(clause[1])
        : { display: "?", ref: [] as string[] };
    return { column, direction };
  });
}
