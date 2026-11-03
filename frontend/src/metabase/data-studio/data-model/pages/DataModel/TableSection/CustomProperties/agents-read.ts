import { t } from "ttag";

import type {
  PropertyRegistry,
  RegistryProperty,
  ResolvedEavBinding,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { FieldId, Table } from "metabase-types/api";

import { getEntityNoun } from "../../PropertyDetailsPanel/property-labels";

const nameOf = (table: Table | undefined, fieldId: FieldId | null) =>
  table?.fields?.find((field) => getRawTableFieldId(field) === fieldId)?.name ??
  "null";

const qualifiedName = (table: Pick<Table, "schema" | "name">) =>
  `${table.schema}.${table.name}`;

function getPropertyYaml(property: RegistryProperty) {
  const key = /^[a-z_][a-z0-9_]*$/.test(property.name)
    ? property.name
    : `"${property.name}"`;
  if (property.mergedInto) {
    return `  ${key}: { merged_into: ${property.mergedInto} }`;
  }
  const entries = [
    `label: ${property.displayName}`,
    `type: ${property.type}`,
    property.semanticType && `semantic_type: ${property.semanticType}`,
    property.signals.some((signal) => signal.type === "type-drift") &&
      `on_mismatch: ${property.onMismatch === "ignore" ? "null" : "keep_text"}`,
    property.definition == null && `definition: not_found`,
    property.isHidden && `hidden: true`,
    `coverage: ${property.coverage.toFixed(2)}`,
    property.synonyms.length > 0 &&
      `synonyms: [${property.synonyms.join(", ")}]`,
  ].filter(Boolean);
  return `  ${key}: { ${entries.join(", ")} }`;
}

export function getAgentsReadYaml(
  table: Table,
  resolved: ResolvedEavBinding,
  registry: PropertyRegistry,
) {
  const { binding, definitionTable } = resolved;
  return [
    `role: role/CustomPropertyTable`,
    `eav:`,
    `  entity_key_field: ${nameOf(table, binding.entityKeyFieldId)}`,
    `  property_name_field: ${nameOf(table, binding.propertyFieldId)}`,
    `  property_value_field: ${nameOf(table, binding.valueFieldId)}`,
    `  definition_table: ${definitionTable ? qualifiedName(definitionTable) : "null"}`,
    `  label_field: ${nameOf(definitionTable, binding.labelFieldId)}`,
    `  type_field: ${nameOf(definitionTable, binding.typeFieldId)}`,
    `properties:`,
    ...registry.properties.map(getPropertyYaml),
  ].join("\n");
}

export function getAgentsReadSentences(
  table: Table,
  resolved: ResolvedEavBinding,
  registry: PropertyRegistry,
): string[] {
  const { entityTable, entityKeyField, definitionTable } = resolved;
  const noun = getEntityNoun(entityTable);
  const definedCount = registry.properties.filter(
    (property) => property.definition != null,
  ).length;
  const visibleCount = registry.properties.filter(
    (property) => !property.isHidden && property.mergedInto == null,
  ).length;
  const castCount = registry.properties.filter(
    (property) => property.type !== "text",
  ).length;
  return [
    entityTable && entityKeyField
      ? t`${table.name} adds custom properties to ${noun.plural}: one row per ${noun.singular}, property and value, joined on ${entityKeyField.name}.`
      : t`${table.name} holds one row per entity, property and value.`,
    definitionTable
      ? t`${definedCount} properties are defined in ${definitionTable.name}, which gives each one its label and type.`
      : t`${visibleCount} properties were found in the values. There's no definitions table, so labels and types are inferred.`,
    t`Values are stored as text. ${castCount} properties are cast to their type, and values that don't fit are left out unless a property keeps them as text.`,
  ];
}
