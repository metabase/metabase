import { match } from "ts-pattern";
import { t } from "ttag";

import type { PropertySemanticType, PropertyType } from "../property-registry";

import type { CheckTableRef, FormatCheckType, GeneratedCheck } from "./types";
import { formatColumnRef, formatTableRef } from "./yaml";

export type CustomPropertyCheckProperty = {
  key: string;
  name: string;
  label: string;
  type: PropertyType;
  semanticType: PropertySemanticType | null;
  knownValues: readonly string[] | null;
  isMultiValued: boolean;
  looksLike: string | null;
};

export type CustomPropertyChecksInput = {
  table: CheckTableRef;
  columns: {
    entityKey: string;
    property: string;
    value: string;
  };
  entity: { table: CheckTableRef; keyColumn: string } | null;
  definitions: {
    table: CheckTableRef;
    keyColumn: string;
    nameColumn: string | null;
  } | null;
  properties: readonly CustomPropertyCheckProperty[];
};

const SIMPLE_IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;
const NUMERIC_LITERAL_RE = /^-?\d+(\.\d+)?$/;

const sqlIdentifier = (name: string) =>
  SIMPLE_IDENTIFIER_RE.test(name) ? name : `"${name.replace(/"/g, '""')}"`;

const sqlLiteral = (value: string) =>
  NUMERIC_LITERAL_RE.test(value) ? value : `'${value.replace(/'/g, "''")}'`;

const wherePropertyIs = (column: string, key: string) =>
  `${sqlIdentifier(column)} = ${sqlLiteral(key)}`;

const wherePropertyIsNotIn = (column: string, keys: readonly string[]) =>
  `${sqlIdentifier(column)} NOT IN (${keys.map(sqlLiteral).join(", ")})`;

type ValueRule =
  | { kind: "format"; format: FormatCheckType; name: string }
  | { kind: "pattern"; pattern: string; flags: string; name: string }
  | { kind: "values"; values: readonly string[]; name: string };

function getValueRule(property: CustomPropertyCheckProperty): ValueRule | null {
  const { label } = property;
  return match(property)
    .with({ type: "integer" }, () => ({
      kind: "format" as const,
      format: "integer" as const,
      name: t`${label} is a whole number`,
    }))
    .with({ type: "decimal" }, () => ({
      kind: "format" as const,
      format: "decimal" as const,
      name: t`${label} is a number`,
    }))
    .with({ type: "date" }, () => ({
      kind: "format" as const,
      format: "date" as const,
      name: t`${label} is a date`,
    }))
    .with({ type: "boolean" }, () => ({
      kind: "pattern" as const,
      pattern: "^(true|false)$",
      flags: "i",
      name: t`${label} is true or false`,
    }))
    .with({ type: "text", semanticType: "type/Email" }, () => ({
      kind: "format" as const,
      format: "email" as const,
      name: t`${label} is an email address`,
    }))
    .with({ type: "text" }, ({ knownValues }) =>
      knownValues != null && knownValues.length > 0
        ? {
            kind: "values" as const,
            values: knownValues,
            name: t`${label} is one of its known values`,
          }
        : null,
    )
    .exhaustive();
}

function getValueCheck(
  input: CustomPropertyChecksInput,
  property: CustomPropertyCheckProperty,
): GeneratedCheck | null {
  const rule = getValueRule(property);
  if (rule == null) {
    return null;
  }
  const common = {
    id: `value:${property.key}`,
    table: input.table,
    name: rule.name,
    where: wherePropertyIs(input.columns.property, property.key),
    severity: "error" as const,
    basis: t`Type of the ${property.name} property`,
  };
  return match(rule)
    .with({ kind: "format" }, ({ format }) => ({
      ...common,
      check: "valid_format" as const,
      params: { column: input.columns.value, format },
    }))
    .with({ kind: "pattern" }, ({ pattern, flags }) => ({
      ...common,
      check: "matches_regex" as const,
      params: { column: input.columns.value, pattern, flags },
    }))
    .with({ kind: "values" }, ({ values }) => ({
      ...common,
      check: "accepted_values" as const,
      params: { column: input.columns.value, values },
    }))
    .exhaustive();
}

function getEntityCheck({
  table,
  columns,
  entity,
}: CustomPropertyChecksInput): GeneratedCheck | null {
  if (entity == null) {
    return null;
  }
  return {
    id: "entity-key",
    check: "references",
    table,
    params: {
      column: columns.entityKey,
      to: formatColumnRef(entity.table, entity.keyColumn),
    },
    name: t`Every ${columns.entityKey} is in ${entity.table.name}`,
    severity: "error",
    basis: t`Belongs to ${formatTableRef(entity.table)}`,
  };
}

function getOneValueCheck({
  table,
  columns,
  properties,
}: CustomPropertyChecksInput): GeneratedCheck {
  const multiValuedKeys = properties
    .filter(({ isMultiValued }) => isMultiValued)
    .map(({ key }) => key);
  return {
    id: "one-value",
    check: "unique_combination",
    table,
    params: { columns: [columns.entityKey, columns.property] },
    name: t`One ${columns.value} per ${columns.entityKey} and ${columns.property}`,
    where:
      multiValuedKeys.length > 0
        ? wherePropertyIsNotIn(columns.property, multiValuedKeys)
        : undefined,
    severity: "error",
    basis: t`Custom property table grain`,
  };
}

function getDefinitionCheck({
  table,
  columns,
  definitions,
}: CustomPropertyChecksInput): GeneratedCheck | null {
  if (definitions == null) {
    return null;
  }
  return {
    id: "definition",
    check: "references",
    table,
    params: {
      column: columns.property,
      to: formatColumnRef(definitions.table, definitions.keyColumn),
    },
    name: t`Every ${columns.property} has a definition`,
    severity: "error",
    basis: t`Definitions in ${formatTableRef(definitions.table)}`,
  };
}

function getLookAlikeCheck({
  table,
  columns,
  definitions,
  properties,
}: CustomPropertyChecksInput): GeneratedCheck | null {
  const lookAlikes = properties.filter(({ looksLike }) => looksLike != null);
  if (lookAlikes.length === 0) {
    return null;
  }
  const nameColumn = definitions?.nameColumn;
  const target =
    definitions != null && nameColumn != null
      ? {
          table: definitions.table,
          column: nameColumn,
          values: lookAlikes.map(({ name }) => name),
        }
      : {
          table,
          column: columns.property,
          values: lookAlikes.map(({ key }) => key),
        };
  return {
    id: "look-alike",
    check: "not_in_set",
    table: target.table,
    params: { column: target.column, values: target.values },
    name: t`No property names that look like another`,
    severity: "warn",
    basis: lookAlikes
      .map(({ name, looksLike }) => t`${name} looks like ${looksLike}`)
      .join(", "),
  };
}

export function getCustomPropertyChecks(
  input: CustomPropertyChecksInput,
): GeneratedCheck[] {
  const checks = [
    getEntityCheck(input),
    getOneValueCheck(input),
    getDefinitionCheck(input),
    ...input.properties.map((property) => getValueCheck(input, property)),
    getLookAlikeCheck(input),
  ];
  return checks.filter((check): check is GeneratedCheck => check != null);
}
