import { useMemo } from "react";
import { t } from "ttag";

import {
  type PropertyRegistry,
  type RegistryProperty,
  type ResolvedEavBinding,
  useEavBinding,
  usePropertyRegistry,
  useTableStructures,
} from "metabase/metadata/table-structure";
import {
  type CheckResult,
  type CustomPropertyCheckProperty,
  type CustomPropertyChecksInput,
  type GeneratedCheck,
  getGeneratedChecks,
} from "metabase/metadata/table-structure/generated-checks";
import type { Table } from "metabase-types/api";

import {
  getBindingColumns,
  getBoundEntity,
  getFieldName,
  toTableRef,
} from "./binding-columns";

const KNOWN_VALUES_MAX_COUNT = 12;
const SHOWN_EXAMPLES_COUNT = 3;

function toCheckProperty(
  property: RegistryProperty,
): CustomPropertyCheckProperty {
  const duplicate = property.signals.find(
    (signal) => signal.type === "duplicate",
  );
  const hasKnownValues =
    property.semanticType === "type/Category" &&
    property.distinctValueCount > 0 &&
    property.distinctValueCount <= KNOWN_VALUES_MAX_COUNT;
  return {
    key: property.key,
    name: property.name,
    label: property.displayName,
    type: property.type,
    semanticType: property.semanticType,
    knownValues: hasKnownValues
      ? property.topValues.map(({ value }) => value).sort()
      : null,
    isMultiValued: property.rowCount > property.entityCount,
    looksLike: duplicate?.type === "duplicate" ? duplicate.propertyName : null,
  };
}

function getChecksInput(
  table: Table,
  resolved: ResolvedEavBinding,
  registry: PropertyRegistry,
): CustomPropertyChecksInput | null {
  const { definitionTable } = resolved;
  const columns = getBindingColumns(table, resolved);
  if (columns == null) {
    return null;
  }
  const definitionKeyColumn = getFieldName(
    definitionTable?.fields,
    resolved.definitionJoinFieldId,
  );
  return {
    table: toTableRef(table),
    columns,
    entity: getBoundEntity(resolved),
    definitions:
      definitionTable != null && definitionKeyColumn != null
        ? {
            table: toTableRef(definitionTable),
            keyColumn: definitionKeyColumn,
            nameColumn: getFieldName(
              definitionTable.fields,
              resolved.definitionNameFieldId,
            ),
          }
        : null,
    properties: registry.properties.map(toCheckProperty),
  };
}

const formatExamples = (examples: { value: string; entityCount: number }[]) =>
  examples
    .slice(0, SHOWN_EXAMPLES_COUNT)
    .map(({ value, entityCount }) => `"${value}" · ${entityCount}`)
    .join(", ");

function getCheckResult(
  check: GeneratedCheck,
  registry: PropertyRegistry,
): CheckResult {
  const { properties } = registry;
  if (check.id === "definition") {
    const undefinedKeys = properties
      .filter(({ signals }) => signals.some(({ type }) => type === "undefined"))
      .map(({ key }) => key);
    return undefinedKeys.length > 0
      ? {
          status: "failing",
          summary: t`No definition for ${undefinedKeys.join(", ")}`,
        }
      : { status: "passing" };
  }
  if (check.id === "look-alike") {
    const pairs = properties.flatMap(({ name, signals }) =>
      signals.flatMap((signal) =>
        signal.type === "duplicate"
          ? [t`${name} looks like ${signal.propertyName}`]
          : [],
      ),
    );
    return pairs.length > 0
      ? { status: "failing", summary: pairs.join(", ") }
      : { status: "passing" };
  }
  const property = properties.find(({ key }) => check.id === `value:${key}`);
  const drift = property?.signals.find(({ type }) => type === "type-drift");
  if (drift?.type === "type-drift") {
    return {
      status: "failing",
      summary: t`${drift.nonConformingCount.toLocaleString()} values don't fit: ${formatExamples(drift.exampleCounts)}`,
    };
  }
  return { status: "passing" };
}

export function useCustomPropertyChecks(table: Table) {
  const { getTableStructure } = useTableStructures();
  const structure = getTableStructure(table);
  const resolved = useEavBinding(table);
  const state = usePropertyRegistry(table);
  const registry = state.status === "loaded" ? state.registry : null;

  return useMemo(() => {
    if (registry == null) {
      return null;
    }
    const checks = getGeneratedChecks({
      structure,
      customProperties: getChecksInput(table, resolved, registry),
    });
    const results = new Map(
      checks.map((check) => [check.id, getCheckResult(check, registry)]),
    );
    return { tableRef: toTableRef(table), checks, results };
  }, [table, structure, resolved, registry]);
}
