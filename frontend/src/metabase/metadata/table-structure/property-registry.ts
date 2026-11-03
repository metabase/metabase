import { useCallback, useMemo } from "react";
import _ from "underscore";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import type {
  Aggregation,
  ConcreteFieldReference,
  Dataset,
  FieldId,
  RowValue,
  StructuredDatasetQuery,
  Table,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import type { EavBinding } from "./inference";

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
  | { type: "new" }
  | { type: "stale" }
  | { type: "type-drift"; nonConformingCount: number; examples: string[] }
  | { type: "duplicate"; propertyName: string };
type ObservedProperty = {
  name: string;
  entityCount: number;
  rowCount: number;
  distinctValueCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  topValues: PropertyValueCount[];
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
  displayName: string;
  description: string;
  type: PropertyType;
  inferredType: PropertyType;
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
};

export type PropertyRegistryState =
  | { status: "unbound" }
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "loaded"; registry: PropertyRegistry };

// PROTOTYPE: mocked. There's no property registry table or API yet, so admin
// overrides live in localStorage and the rest is profiled in the browser with
// three group-by queries against the property table.
const STORAGE_KEY = "metabase-prototype-property-registry";
const TOP_VALUES_LIMIT = 10000;
const TYPE_CONFORMANCE_THRESHOLD = 0.9;
const CATEGORY_MAX_DISTINCT_VALUES = 30;
const NEW_PROPERTY_DAYS = 14;
const STALE_PROPERTY_DAYS = 180;
const DUPLICATE_VALUE_OVERLAP = 0.5;
const DAY_MS = 24 * 60 * 60 * 1000;

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

const minOf = (ref: ConcreteFieldReference): Aggregation => ["min", ref];
const maxOf = (ref: ConcreteFieldReference): Aggregation => ["max", ref];

type BoundEav = {
  entityKeyFieldId: FieldId;
  propertyFieldId: FieldId;
  valueFieldId: FieldId;
  changedAtFieldId: FieldId | null;
};

function getBoundEav(binding: EavBinding): BoundEav | null {
  const { entityKeyFieldId, propertyFieldId, valueFieldId, changedAtFieldId } =
    binding;
  if (entityKeyFieldId == null || propertyFieldId == null) {
    return null;
  }
  if (valueFieldId == null) {
    return null;
  }
  return { entityKeyFieldId, propertyFieldId, valueFieldId, changedAtFieldId };
}

export function getPropertySummaryQuery(
  table: Pick<Table, "db_id" | "id">,
  eav: BoundEav,
): StructuredDatasetQuery {
  const changedAt =
    eav.changedAtFieldId != null ? fieldRef(eav.changedAtFieldId) : null;
  return {
    database: table.db_id,
    type: "query",
    query: {
      "source-table": table.id,
      aggregation: [
        ["distinct", fieldRef(eav.entityKeyFieldId)],
        ["count"],
        ["distinct", fieldRef(eav.valueFieldId)],
        ...(changedAt ? [minOf(changedAt), maxOf(changedAt)] : []),
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

const toNumber = (value: RowValue) => (typeof value === "number" ? value : 0);
const toText = (value: RowValue) => (value == null ? "" : String(value));
const toDate = (value: RowValue) => (typeof value === "string" ? value : null);

function readObservedProperties(
  summary: Dataset,
  values: Dataset,
): ObservedProperty[] {
  const hasDates = summary.data.cols.length > 4;
  const valuesByProperty = _.groupBy(values.data.rows, (row) => toText(row[0]));
  return summary.data.rows.map((row) => {
    const name = toText(row[0]);
    return {
      name,
      entityCount: toNumber(row[1]),
      rowCount: toNumber(row[2]),
      distinctValueCount: toNumber(row[3]),
      firstSeen: hasDates ? toDate(row[4]) : null,
      lastSeen: hasDates ? toDate(row[5]) : null,
      topValues: (valuesByProperty[name] ?? []).map((valueRow) => ({
        value: toText(valueRow[1]),
        count: toNumber(valueRow[2]),
      })),
    };
  });
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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CURRENCY_NAME_RE = /(^|_)(mrr|arr|revenue|amount|price|usd|eur)(_|$)/;
const QUANTITY_NAME_RE = /(^|_)(seats|licenses|count|quantity|users)(_|$)/;
const SCORE_NAME_RE = /(^|_)(score|nps|rating)(_|$)/;

function inferSemanticType(
  property: ObservedProperty,
  type: PropertyType,
): PropertySemanticType | null {
  const name = property.name.toLowerCase();
  if (type === "text") {
    if (property.topValues.every(({ value }) => EMAIL_RE.test(value))) {
      return "type/Email";
    }
    return property.distinctValueCount <= CATEGORY_MAX_DISTINCT_VALUES
      ? "type/Category"
      : null;
  }
  if (type === "decimal" && CURRENCY_NAME_RE.test(name)) {
    return "type/Currency";
  }
  if (type === "integer" && SCORE_NAME_RE.test(name)) {
    return "type/Score";
  }
  if (type === "integer" && QUANTITY_NAME_RE.test(name)) {
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
function findDuplicateOf(
  property: ObservedProperty,
  others: ObservedProperty[],
): ObservedProperty | undefined {
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
  property: ObservedProperty,
  type: PropertyType,
  others: ObservedProperty[],
  now: number,
): PropertySignal[] {
  const signals: PropertySignal[] = [];
  const firstSeenMs = property.firstSeen ? Date.parse(property.firstSeen) : NaN;
  const lastSeenMs = property.lastSeen ? Date.parse(property.lastSeen) : NaN;
  if (now - firstSeenMs < NEW_PROPERTY_DAYS * DAY_MS) {
    signals.push({ type: "new" });
  }
  if (now - lastSeenMs > STALE_PROPERTY_DAYS * DAY_MS) {
    signals.push({ type: "stale" });
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
    signals.push({ type: "duplicate", propertyName: duplicateOf.name });
  }
  return signals;
}

function buildRegistry(
  observed: ObservedProperty[],
  entityCount: number,
  overridesByName: Record<string, PropertyOverrides>,
  now: number,
): PropertyRegistry {
  const properties = observed.map((property): RegistryProperty => {
    const overrides = overridesByName[property.name] ?? {};
    const inferredType = inferPropertyType(property.topValues);
    const type = overrides.type ?? inferredType;
    const signals = getSignals(property, type, observed, now).filter(
      (signal) => signal.type !== "duplicate" || !overrides.mergedInto,
    );
    return {
      ...property,
      displayName: overrides.displayName ?? humanizePropertyName(property.name),
      description: overrides.description ?? "",
      type,
      inferredType,
      semanticType:
        overrides.semanticType !== undefined
          ? overrides.semanticType
          : inferSemanticType(property, type),
      synonyms: overrides.synonyms ?? [],
      isHidden: overrides.isHidden ?? signals.some((s) => s.type === "stale"),
      mergedInto: overrides.mergedInto ?? null,
      coverage: entityCount > 0 ? property.entityCount / entityCount : 0,
      signals,
    };
  });
  return {
    entityCount,
    rowCount: observed.reduce((sum, { rowCount }) => sum + rowCount, 0),
    properties: _.sortBy(properties, (property) => -property.coverage),
  };
}
export function usePropertyRegistry(
  table: Pick<Table, "db_id" | "id">,
  binding: EavBinding,
): PropertyRegistryState {
  const [storage] = usePrototypeStorage(STORAGE_KEY, parseStorage);
  const eav = getBoundEav(binding);
  const summary = useGetAdhocQueryQuery(
    eav ? getPropertySummaryQuery(table, eav) : skipToken,
  );
  const values = useGetAdhocQueryQuery(
    eav ? getPropertyValuesQuery(table, eav) : skipToken,
  );
  const entities = useGetAdhocQueryQuery(
    eav ? getEntityCountQuery(table, eav) : skipToken,
  );
  const overridesByName = storage[getTableKey(table)];

  return useMemo((): PropertyRegistryState => {
    if (!eav) {
      return { status: "unbound" };
    }
    const error = summary.error ?? values.error ?? entities.error;
    if (error) {
      return { status: "error", error };
    }
    if (!summary.data || !values.data || !entities.data) {
      return { status: "loading" };
    }
    const entityCount = toNumber(entities.data.data.rows[0]?.[0] ?? 0);
    return {
      status: "loaded",
      registry: buildRegistry(
        readObservedProperties(summary.data, values.data),
        entityCount,
        overridesByName ?? {},
        Date.now(),
      ),
    };
  }, [
    eav,
    summary.data,
    summary.error,
    values.data,
    values.error,
    entities.data,
    entities.error,
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
