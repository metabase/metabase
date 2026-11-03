import { useCallback, useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import type {
  ConcreteFieldReference,
  ConcreteTableId,
  Dataset,
  FieldId,
  RowValue,
  StructuredDatasetQuery,
  Table,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { type ResolvedEavBinding, useEavBinding } from "./eav-binding";

export const PROPERTY_TYPES = [
  "text",
  "integer",
  "decimal",
  "date",
  "boolean",
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

const PROPERTY_BASE_TYPES = {
  text: "type/Text",
  integer: "type/Integer",
  decimal: "type/Decimal",
  date: "type/Date",
  boolean: "type/Boolean",
} as const satisfies Record<PropertyType, string>;

export function getPropertyBaseType(type: PropertyType) {
  return PROPERTY_BASE_TYPES[type];
}

export const PROPERTY_SEMANTIC_TYPES = [
  "type/Category",
  "type/Email",
  "type/Currency",
  "type/Quantity",
  "type/Score",
] as const;

export type PropertySemanticType = (typeof PROPERTY_SEMANTIC_TYPES)[number];

export type PropertyValueCount = { value: string; count: number };

export type PropertySignal =
  | { type: "undefined" }
  | { type: "unused" }
  | { type: "type-drift"; nonConformingCount: number; examples: string[] }
  | { type: "duplicate"; propertyName: string; propertyLabel: string };

export type PropertySource = "admin" | "definition" | "values";

type ObservedProperty = {
  key: string;
  entityCount: number;
  rowCount: number;
  distinctValueCount: number;
  topValues: PropertyValueCount[];
};

export type PropertyDefinition = {
  key: string;
  name: string | null;
  label: string | null;
  declaredType: string | null;
};

type PropertyOverrides = {
  displayName?: string;
  description?: string;
  type?: PropertyType;
  semanticType?: PropertySemanticType | null;
  synonyms?: string[];
  isHidden?: boolean;
  mergedInto?: string;
};

export type RegistryProperty = ObservedProperty & {
  name: string;
  definition: PropertyDefinition | null;
  displayName: string;
  labelSource: PropertySource;
  description: string;
  type: PropertyType;
  inferredType: PropertyType;
  typeSource: PropertySource;
  semanticType: PropertySemanticType | null;
  synonyms: string[];
  isHidden: boolean;
  mergedInto: string | null;
  coverage: number;
  signals: PropertySignal[];
};

export type PropertyRegistry = {
  entityCount: number;
  rowCount: number;
  properties: RegistryProperty[];
  hasDefinitions: boolean;
};

export type PropertyRegistryState =
  | { status: "unbound" }
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "loaded"; registry: PropertyRegistry };

// PROTOTYPE: mocked. There's no eav_definition column or API yet, so admin
// overrides live in localStorage. Labels and types are read from the
// definitions table, and the values are profiled with group-by queries.
const STORAGE_KEY = "metabase-prototype-property-registry";
const TOP_VALUES_LIMIT = 10000;
const DEFINITIONS_LIMIT = 2000;
const TYPE_CONFORMANCE_THRESHOLD = 0.9;
const CATEGORY_MAX_DISTINCT_VALUES = 30;
const DUPLICATE_VALUE_OVERLAP = 0.5;

type RegistryStorage = Record<string, Record<string, PropertyOverrides>>;

const isPropertyType = (value: unknown): value is PropertyType =>
  PROPERTY_TYPES.some((type) => type === value);

const isPropertySemanticType = (
  value: unknown,
): value is PropertySemanticType =>
  PROPERTY_SEMANTIC_TYPES.some((type) => type === value);

const parseString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

function parsePropertyOverrides(value: unknown): PropertyOverrides {
  if (!isObject(value)) {
    return {};
  }
  return {
    displayName: parseString(value.displayName),
    description: parseString(value.description),
    type: isPropertyType(value.type) ? value.type : undefined,
    semanticType:
      value.semanticType === null || isPropertySemanticType(value.semanticType)
        ? value.semanticType
        : undefined,
    synonyms: Array.isArray(value.synonyms)
      ? value.synonyms.filter((synonym) => typeof synonym === "string")
      : undefined,
    isHidden: typeof value.isHidden === "boolean" ? value.isHidden : undefined,
    mergedInto: parseString(value.mergedInto),
  };
}

function parseStorage(value: unknown): RegistryStorage {
  if (!isObject(value)) {
    return {};
  }
  return _.mapObject(value, (properties) =>
    isObject(properties) ? _.mapObject(properties, parsePropertyOverrides) : {},
  );
}

function getTableKey(table: Pick<Table, "db_id" | "id">) {
  return `${table.db_id}:${table.id}`;
}

const fieldRef = (fieldId: FieldId): ConcreteFieldReference => [
  "field",
  fieldId,
  null,
];

type BoundEav = {
  entityKeyFieldId: FieldId;
  propertyFieldId: FieldId;
  valueFieldId: FieldId;
};

export type BoundDefinitions = {
  tableId: ConcreteTableId;
  keyFieldId: FieldId;
  nameFieldId: FieldId | null;
  labelFieldId: FieldId | null;
  typeFieldId: FieldId | null;
};

function getBoundEav({ binding }: ResolvedEavBinding): BoundEav | null {
  const { entityKeyFieldId, propertyFieldId, valueFieldId } = binding;
  if (entityKeyFieldId == null || propertyFieldId == null) {
    return null;
  }
  if (valueFieldId == null) {
    return null;
  }
  return { entityKeyFieldId, propertyFieldId, valueFieldId };
}

function getBoundDefinitions({
  binding,
  definitionJoinFieldId,
  definitionNameFieldId,
}: ResolvedEavBinding): BoundDefinitions | null {
  const { definitionTableId, labelFieldId, typeFieldId } = binding;
  if (definitionTableId == null || definitionJoinFieldId == null) {
    return null;
  }
  return {
    tableId: definitionTableId,
    keyFieldId: definitionJoinFieldId,
    nameFieldId: definitionNameFieldId,
    labelFieldId,
    typeFieldId,
  };
}

export function getPropertySummaryQuery(
  table: Pick<Table, "db_id" | "id">,
  eav: BoundEav,
): StructuredDatasetQuery {
  return {
    database: table.db_id,
    type: "query",
    query: {
      "source-table": table.id,
      aggregation: [
        ["distinct", fieldRef(eav.entityKeyFieldId)],
        ["count"],
        ["distinct", fieldRef(eav.valueFieldId)],
      ],
      breakout: [fieldRef(eav.propertyFieldId)],
    },
  };
}

export function getPropertyValuesQuery(
  table: Pick<Table, "db_id" | "id">,
  eav: BoundEav,
): StructuredDatasetQuery {
  return {
    database: table.db_id,
    type: "query",
    query: {
      "source-table": table.id,
      aggregation: [["count"]],
      breakout: [fieldRef(eav.propertyFieldId), fieldRef(eav.valueFieldId)],
      "order-by": [["desc", ["aggregation", 0]]],
      limit: TOP_VALUES_LIMIT,
    },
  };
}

export function getEntityCountQuery(
  table: Pick<Table, "db_id" | "id">,
  eav: BoundEav,
): StructuredDatasetQuery {
  return {
    database: table.db_id,
    type: "query",
    query: {
      "source-table": table.id,
      aggregation: [["distinct", fieldRef(eav.entityKeyFieldId)]],
    },
  };
}

const getDefinitionFieldIds = (definitions: BoundDefinitions) => [
  definitions.keyFieldId,
  definitions.nameFieldId,
  definitions.labelFieldId,
  definitions.typeFieldId,
];

export function getDefinitionsQuery(
  databaseId: Table["db_id"],
  definitions: BoundDefinitions,
): StructuredDatasetQuery {
  return {
    database: databaseId,
    type: "query",
    query: {
      "source-table": definitions.tableId,
      fields: getDefinitionFieldIds(definitions)
        .filter((fieldId) => fieldId != null)
        .map(fieldRef),
      limit: DEFINITIONS_LIMIT,
    },
  };
}

const toNumber = (value: RowValue) => (typeof value === "number" ? value : 0);
const toText = (value: RowValue) => (value == null ? "" : String(value));
const toOptionalText = (value: RowValue) =>
  value == null || value === "" ? null : String(value);

function readObservedProperties(
  summary: Dataset,
  values: Dataset,
): ObservedProperty[] {
  const valuesByProperty = _.groupBy(values.data.rows, (row) => toText(row[0]));
  return summary.data.rows.map((row) => {
    const key = toText(row[0]);
    return {
      key,
      entityCount: toNumber(row[1]),
      rowCount: toNumber(row[2]),
      distinctValueCount: toNumber(row[3]),
      topValues: (valuesByProperty[key] ?? []).map((valueRow) => ({
        value: toText(valueRow[1]),
        count: toNumber(valueRow[2]),
      })),
    };
  });
}

export function readDefinitions(
  dataset: Dataset,
  definitions: BoundDefinitions,
): PropertyDefinition[] {
  const columnIds = getDefinitionFieldIds(definitions).filter(
    (fieldId) => fieldId != null,
  );
  const indexOf = (fieldId: FieldId | null) =>
    fieldId == null ? -1 : columnIds.indexOf(fieldId);
  const read = (row: RowValue[], fieldId: FieldId | null) => {
    const index = indexOf(fieldId);
    return index >= 0 ? toOptionalText(row[index]) : null;
  };
  return dataset.data.rows.map((row) => ({
    key: toText(row[indexOf(definitions.keyFieldId)]),
    name: read(row, definitions.nameFieldId),
    label: read(row, definitions.labelFieldId),
    declaredType: read(row, definitions.typeFieldId),
  }));
}

const TYPE_PATTERNS: Record<Exclude<PropertyType, "text">, RegExp> = {
  integer: /^-?\d+$/,
  decimal: /^-?\d+(\.\d+)?$/,
  date: /^\d{4}-\d{2}-\d{2}/,
  boolean: /^(true|false)$/i,
};

export function conformsToType(value: string, type: PropertyType): boolean {
  return type === "text" || TYPE_PATTERNS[type].test(value.trim());
}

function getConformingShare(values: PropertyValueCount[], type: PropertyType) {
  const total = values.reduce((sum, { count }) => sum + count, 0);
  const conforming = values
    .filter(({ value }) => conformsToType(value, type))
    .reduce((sum, { count }) => sum + count, 0);
  return total > 0 ? conforming / total : 0;
}

export function inferPropertyType(values: PropertyValueCount[]): PropertyType {
  const candidates: PropertyType[] = ["boolean", "integer", "decimal", "date"];
  return (
    candidates.find(
      (type) => getConformingShare(values, type) >= TYPE_CONFORMANCE_THRESHOLD,
    ) ?? "text"
  );
}

type DeclaredMeaning = {
  type: PropertyType;
  semanticType: PropertySemanticType | null;
};

export function readDeclaredType(
  declaredType: string | null,
  values: PropertyValueCount[],
): DeclaredMeaning | null {
  if (declaredType == null) {
    return null;
  }
  const isWholeNumber =
    values.length === 0 ||
    getConformingShare(values, "integer") >= TYPE_CONFORMANCE_THRESHOLD;
  return match(declaredType.toLowerCase())
    .with("number", "numeric", "integer", "decimal", () => ({
      type: isWholeNumber ? ("integer" as const) : ("decimal" as const),
      semanticType: null,
    }))
    .with("currency", "money", () => ({
      type: "decimal" as const,
      semanticType: "type/Currency" as const,
    }))
    .with("date", "datetime", () => ({
      type: "date" as const,
      semanticType: null,
    }))
    .with("checkbox", "bool", "boolean", () => ({
      type: "boolean" as const,
      semanticType: null,
    }))
    .with("dropdown", "enumeration", "select", "tagger", () => ({
      type: "text" as const,
      semanticType: "type/Category" as const,
    }))
    .with("text", "string", "textarea", () => ({
      type: "text" as const,
      semanticType: null,
    }))
    .otherwise(() => null);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CURRENCY_NAME_RE = /(^|_)(mrr|arr|revenue|amount|price|usd|eur)(_|$)/;
const QUANTITY_NAME_RE = /(^|_)(seats|licenses|count|quantity|users)(_|$)/;
const SCORE_NAME_RE = /(^|_)(score|nps|rating)(_|$)/;

function inferSemanticType(
  name: string,
  property: ObservedProperty,
  type: PropertyType,
): PropertySemanticType | null {
  const lowerName = name.toLowerCase();
  if (type === "text") {
    const hasEmails =
      property.topValues.length > 0 &&
      property.topValues.every(({ value }) => EMAIL_RE.test(value));
    if (hasEmails) {
      return "type/Email";
    }
    return property.distinctValueCount <= CATEGORY_MAX_DISTINCT_VALUES
      ? "type/Category"
      : null;
  }
  if (type === "decimal" && CURRENCY_NAME_RE.test(lowerName)) {
    return "type/Currency";
  }
  if (type === "integer" && SCORE_NAME_RE.test(lowerName)) {
    return "type/Score";
  }
  if (type === "integer" && QUANTITY_NAME_RE.test(lowerName)) {
    return "type/Quantity";
  }
  return null;
}

function humanizePropertyName(name: string) {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const nameTokens = (name: string) =>
  name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const valueSet = (property: ObservedProperty) =>
  new Set(property.topValues.map(({ value }) => value.toLowerCase()));

type NamedProperty = ObservedProperty & { name: string; label: string };

function findDuplicateOf(
  property: NamedProperty,
  others: NamedProperty[],
): NamedProperty | undefined {
  const tokens = nameTokens(property.name);
  const values = valueSet(property);
  return others.find((other) => {
    if (
      other.name === property.name ||
      other.entityCount < property.entityCount
    ) {
      return false;
    }
    const sharesName = nameTokens(other.name).some((token) =>
      tokens.includes(token),
    );
    const otherValues = valueSet(other);
    const overlap =
      values.size > 0
        ? [...values].filter((value) => otherValues.has(value)).length /
          values.size
        : 0;
    return sharesName && overlap >= DUPLICATE_VALUE_OVERLAP;
  });
}

function getSignals(
  property: NamedProperty,
  definition: PropertyDefinition | null,
  hasDefinitions: boolean,
  type: PropertyType,
  others: NamedProperty[],
): PropertySignal[] {
  const signals: PropertySignal[] = [];
  if (hasDefinitions && definition == null) {
    signals.push({ type: "undefined" });
  }
  if (property.rowCount === 0) {
    signals.push({ type: "unused" });
  }
  const nonConforming = property.topValues.filter(
    ({ value }) => !conformsToType(value, type),
  );
  if (nonConforming.length > 0) {
    signals.push({
      type: "type-drift",
      nonConformingCount: nonConforming.reduce(
        (sum, { count }) => sum + count,
        0,
      ),
      examples: nonConforming.map(({ value }) => value),
    });
  }
  const duplicateOf = findDuplicateOf(property, others);
  if (duplicateOf) {
    signals.push({
      type: "duplicate",
      propertyName: duplicateOf.name,
      propertyLabel: duplicateOf.label,
    });
  }
  return signals;
}

const emptyObservation = (key: string): ObservedProperty => ({
  key,
  entityCount: 0,
  rowCount: 0,
  distinctValueCount: 0,
  topValues: [],
});

function getDisplayName(
  overrides: PropertyOverrides,
  definition: PropertyDefinition | null,
  name: string,
  hasDefinitions: boolean,
): Pick<RegistryProperty, "displayName" | "labelSource"> {
  if (overrides.displayName) {
    return { displayName: overrides.displayName, labelSource: "admin" };
  }
  if (definition?.label) {
    return { displayName: definition.label, labelSource: "definition" };
  }
  return {
    displayName:
      hasDefinitions && definition == null
        ? t`Field ${name}`
        : humanizePropertyName(name),
    labelSource: "values",
  };
}

function getTypeSource(
  overrides: PropertyOverrides,
  declared: DeclaredMeaning | null,
): PropertySource {
  if (overrides.type != null) {
    return "admin";
  }
  return declared != null ? "definition" : "values";
}

function buildRegistry(
  observed: ObservedProperty[],
  definitions: PropertyDefinition[] | null,
  entityCount: number,
  overridesByName: Record<string, PropertyOverrides>,
): PropertyRegistry {
  const definitionsByKey = new Map(
    (definitions ?? []).map((definition) => [definition.key, definition]),
  );
  const observedKeys = new Set(observed.map(({ key }) => key));
  const unusedDefinitions = (definitions ?? []).filter(
    ({ key }) => !observedKeys.has(key),
  );
  const named = [
    ...observed,
    ...unusedDefinitions.map(({ key }) => emptyObservation(key)),
  ].map((property): NamedProperty => {
    const definition = definitionsByKey.get(property.key);
    const name = definition?.name ?? property.key;
    return { ...property, name, label: definition?.label ?? name };
  });
  const hasDefinitions = definitions != null;

  const properties = named.map((property): RegistryProperty => {
    const definition = definitionsByKey.get(property.key) ?? null;
    const overrides = overridesByName[property.name] ?? {};
    const inferredType = inferPropertyType(property.topValues);
    const declared = readDeclaredType(
      definition?.declaredType ?? null,
      property.topValues,
    );
    const type = overrides.type ?? declared?.type ?? inferredType;
    const typeSource = getTypeSource(overrides, declared);
    const signals = getSignals(
      property,
      definition,
      hasDefinitions,
      type,
      named,
    ).filter((signal) => signal.type !== "duplicate" || !overrides.mergedInto);
    return {
      ...property,
      definition,
      ...getDisplayName(overrides, definition, property.name, hasDefinitions),
      description: overrides.description ?? "",
      type,
      inferredType: declared?.type ?? inferredType,
      typeSource,
      semanticType:
        overrides.semanticType !== undefined
          ? overrides.semanticType
          : (declared?.semanticType ??
            inferSemanticType(property.name, property, type)),
      synonyms: overrides.synonyms ?? [],
      isHidden:
        overrides.isHidden ?? signals.some((s) => s.type === "undefined"),
      mergedInto: overrides.mergedInto ?? null,
      coverage: entityCount > 0 ? property.entityCount / entityCount : 0,
      signals,
    };
  });
  return {
    entityCount,
    rowCount: observed.reduce((sum, { rowCount }) => sum + rowCount, 0),
    properties: _.sortBy(properties, (property) => -property.coverage),
    hasDefinitions,
  };
}

export function useDefinitionRows(
  databaseId: Table["db_id"],
  definitions: BoundDefinitions | null,
) {
  const { data, error } = useGetAdhocQueryQuery(
    definitions ? getDefinitionsQuery(databaseId, definitions) : skipToken,
  );
  return useMemo(
    () => ({
      definitions:
        data && definitions ? readDefinitions(data, definitions) : undefined,
      error,
    }),
    [data, definitions, error],
  );
}

export function usePropertyRegistry(table: Table): PropertyRegistryState {
  const [storage] = usePrototypeStorage(STORAGE_KEY, parseStorage);
  const resolved = useEavBinding(table);
  const eav = useMemo(() => getBoundEav(resolved), [resolved]);
  const boundDefinitions = useMemo(
    () => getBoundDefinitions(resolved),
    [resolved],
  );
  const summary = useGetAdhocQueryQuery(
    eav ? getPropertySummaryQuery(table, eav) : skipToken,
  );
  const values = useGetAdhocQueryQuery(
    eav ? getPropertyValuesQuery(table, eav) : skipToken,
  );
  const entities = useGetAdhocQueryQuery(
    eav ? getEntityCountQuery(table, eav) : skipToken,
  );
  const definitionRows = useDefinitionRows(table.db_id, boundDefinitions);
  const overridesByName = storage[getTableKey(table)];

  return useMemo((): PropertyRegistryState => {
    if (!eav) {
      return { status: "unbound" };
    }
    const error =
      summary.error ?? values.error ?? entities.error ?? definitionRows.error;
    if (error) {
      return { status: "error", error };
    }
    const isLoadingDefinitions =
      boundDefinitions != null && definitionRows.definitions == null;
    if (
      !summary.data ||
      !values.data ||
      !entities.data ||
      isLoadingDefinitions ||
      resolved.isLoading
    ) {
      return { status: "loading" };
    }
    return {
      status: "loaded",
      registry: buildRegistry(
        readObservedProperties(summary.data, values.data),
        definitionRows.definitions ?? null,
        toNumber(entities.data.data.rows[0]?.[0] ?? 0),
        overridesByName ?? {},
      ),
    };
  }, [
    eav,
    boundDefinitions,
    resolved.isLoading,
    summary.data,
    summary.error,
    values.data,
    values.error,
    entities.data,
    entities.error,
    definitionRows,
    overridesByName,
  ]);
}

export function usePropertyOverrides(table: Pick<Table, "db_id" | "id">) {
  const [, updateStorage] = usePrototypeStorage(STORAGE_KEY, parseStorage);
  return useCallback(
    (propertyName: string, overrides: PropertyOverrides) => {
      const tableKey = getTableKey(table);
      updateStorage((current) => {
        const tableOverrides = current[tableKey] ?? {};
        return {
          ...current,
          [tableKey]: {
            ...tableOverrides,
            [propertyName]: {
              ...tableOverrides[propertyName],
              ...overrides,
            },
          },
        };
      });
    },
    [table, updateStorage],
  );
}
