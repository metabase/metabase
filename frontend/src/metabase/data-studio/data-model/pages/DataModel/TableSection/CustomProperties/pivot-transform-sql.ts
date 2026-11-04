import { match } from "ts-pattern";

import type {
  PropertyRegistry,
  PropertyType,
  RegistryProperty,
} from "metabase/metadata/table-structure";
import type { CheckTableRef } from "metabase/metadata/table-structure/generated-checks";

import type { BindingColumns, BoundEntity } from "./binding-columns";

export type PivotTransformColumn = {
  alias: string;
  keys: readonly string[];
  type: PropertyType;
};

export type PivotTransformInput = {
  table: CheckTableRef;
  bindingColumns: BindingColumns;
  entity: BoundEntity | null;
  columns: readonly PivotTransformColumn[];
};

const NUMERIC_LITERAL_RE = /^-?\d+$/;

const quoteIdentifier = (name: string) => `"${name.replace(/"/g, '""')}"`;

const quoteTable = ({ schema, name }: CheckTableRef) =>
  schema
    ? `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`
    : quoteIdentifier(name);

const quoteLiteral = (value: string) =>
  NUMERIC_LITERAL_RE.test(value) ? value : `'${value.replace(/'/g, "''")}'`;

const toColumnAlias = (name: string) => {
  const alias = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z_]/.test(alias) ? alias : `property_${alias}`;
};

function getColumnExpression(
  column: PivotTransformColumn,
  bindingColumns: BindingColumns,
) {
  const property = `p.${quoteIdentifier(bindingColumns.property)}`;
  const value = `p.${quoteIdentifier(bindingColumns.value)}`;
  const isProperty =
    column.keys.length === 1
      ? `${property} = ${quoteLiteral(column.keys[0])}`
      : `${property} IN (${column.keys.map(quoteLiteral).join(", ")})`;
  const typed = match(column.type)
    .with("text", () => ({ guard: null, cast: value, aggregate: "MAX" }))
    .with("integer", () => ({
      guard: `${value} ~ '^-?[0-9]+$'`,
      cast: `CAST(${value} AS INTEGER)`,
      aggregate: "MAX",
    }))
    .with("decimal", () => ({
      guard: `${value} ~ '^-?[0-9]+(\\.[0-9]+)?$'`,
      cast: `CAST(${value} AS NUMERIC)`,
      aggregate: "MAX",
    }))
    .with("date", () => ({
      guard: `${value} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`,
      cast: `CAST(LEFT(${value}, 10) AS DATE)`,
      aggregate: "MAX",
    }))
    .with("boolean", () => ({
      guard: `${value} ~* '^(true|false)$'`,
      cast: `CAST(${value} AS BOOLEAN)`,
      aggregate: "BOOL_OR",
    }))
    .exhaustive();
  const condition =
    typed.guard != null ? `${isProperty} AND ${typed.guard}` : isProperty;
  return `  ${typed.aggregate}(CASE WHEN ${condition} THEN ${typed.cast} END) AS ${quoteIdentifier(column.alias)}`;
}

export function getPivotTransformSql({
  table,
  bindingColumns,
  entity,
  columns,
}: PivotTransformInput) {
  const entityKeyColumn = bindingColumns.entityKey;
  const entityKey = entity
    ? `e.${quoteIdentifier(entity.keyColumn)}`
    : `p.${quoteIdentifier(entityKeyColumn)}`;
  const select = [
    `  ${entityKey} AS ${quoteIdentifier(entityKeyColumn)}`,
    ...columns.map((column) => getColumnExpression(column, bindingColumns)),
  ];
  const from = entity
    ? [
        `FROM ${quoteTable(entity.table)} AS e`,
        `LEFT JOIN ${quoteTable(table)} AS p`,
        `  ON p.${quoteIdentifier(entityKeyColumn)} = ${entityKey}`,
      ]
    : [`FROM ${quoteTable(table)} AS p`];
  return [
    "SELECT",
    select.join(",\n"),
    ...from,
    `GROUP BY ${entityKey}`,
    `ORDER BY ${entityKey}`,
  ].join("\n");
}

export function getPivotTransformColumns(
  registry: PropertyRegistry,
): PivotTransformColumn[] {
  const isColumn = (property: RegistryProperty) =>
    !property.isHidden && property.mergedInto == null;
  const usedAliases = new Set<string>();
  return registry.properties.filter(isColumn).map((property) => {
    const mergedKeys = registry.properties
      .filter(({ mergedInto }) => mergedInto === property.name)
      .map(({ key }) => key);
    const baseAlias = toColumnAlias(property.name);
    const alias = usedAliases.has(baseAlias)
      ? `${baseAlias}_${property.key}`
      : baseAlias;
    usedAliases.add(alias);
    return {
      alias,
      keys: [property.key, ...mergedKeys],
      type: property.type,
    };
  });
}
