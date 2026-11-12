import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isDate, isFK, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  Field,
  FieldId,
  MeasureId,
  Table,
  TableId,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { inferHistoryBinding } from "./inference";

export const SCD_PROTOTYPE_VARIANTS = [
  "attribute",
  "relationship",
  "form",
  "group",
  "group-flat",
  "sentence",
  "columns",
  "measure",
] as const;

export type ScdPrototypeVariant = (typeof SCD_PROTOTYPE_VARIANTS)[number];

export type VersionChoice = "at-event" | "current";

export type PastValuesSource = "none" | "history-table";

export type PastValuesBinding = {
  source: PastValuesSource;
  historyTableId: TableId | null;
  keyFieldId: FieldId | null;
  validFromFieldId: FieldId | null;
  validToFieldId: FieldId | null;
};

export type ChangingAttribute = PastValuesBinding & {
  valueFieldId: FieldId | null;
  defaultVersion: VersionChoice;
};

export type RelationshipVersioning = PastValuesBinding & {
  version: VersionChoice;
  asOfFieldId: FieldId | null;
  attributeVersions: Record<string, VersionChoice>;
};

export type ColumnPair = {
  showCurrent: boolean;
  showThen: boolean;
  thenName: string | null;
};

type ChangingAttributesState = {
  variant: ScdPrototypeVariant;
  attributes: Record<string, Partial<ChangingAttribute>>;
  relationships: Record<string, Partial<RelationshipVersioning>>;
  dimensionVersions: Record<string, VersionChoice>;
  columnPairs: Record<string, Partial<ColumnPair>>;
  measureVersions: Record<string, VersionChoice>;
};

const DEFAULT_COLUMN_PAIR: ColumnPair = {
  showCurrent: true,
  showThen: true,
  thenName: null,
};

const NO_PAST_VALUES: PastValuesBinding = {
  source: "none",
  historyTableId: null,
  keyFieldId: null,
  validFromFieldId: null,
  validToFieldId: null,
};

const STORAGE_KEY = "metabase-prototype-changing-attributes";

const HISTORY_NAME_RE =
  /_(history|hist|snapshots?|versions?|changes|log|scd)$|^(hist|history|scd)_/;

const nameOf = (field: Pick<Field, "name">) => field.name.toLowerCase();

const singular = (name: string) =>
  name.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");

const isVersionChoice = (value: unknown): value is VersionChoice =>
  value === "at-event" || value === "current";

const isSource = (value: unknown): value is PastValuesSource =>
  value === "none" || value === "history-table";

function parseRecord<T>(
  value: unknown,
  isValue: (entry: unknown) => entry is T,
): Record<string, T> {
  if (!isObject(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, T] =>
      isValue(entry[1]),
    ),
  );
}

function parseColumnPair(value: unknown): Partial<ColumnPair> {
  if (!isObject(value)) {
    return {};
  }
  return _.omit(
    {
      showCurrent:
        typeof value.showCurrent === "boolean" ? value.showCurrent : undefined,
      showThen:
        typeof value.showThen === "boolean" ? value.showThen : undefined,
      thenName:
        value.thenName === null || typeof value.thenName === "string"
          ? value.thenName
          : undefined,
    },
    (entry) => entry === undefined,
  );
}

const parseId = (value: unknown): number | null | undefined =>
  value === null || typeof value === "number" ? value : undefined;

const parseTableId = (value: unknown): TableId | null | undefined =>
  value === null || typeof value === "number" || typeof value === "string"
    ? value
    : undefined;

function parseBinding(value: Record<string, unknown>) {
  return _.omit(
    {
      source: isSource(value.source) ? value.source : undefined,
      historyTableId: parseTableId(value.historyTableId),
      keyFieldId: parseId(value.keyFieldId),
      validFromFieldId: parseId(value.validFromFieldId),
      validToFieldId: parseId(value.validToFieldId),
    },
    (entry) => entry === undefined,
  );
}

function parseAttribute(value: unknown): Partial<ChangingAttribute> {
  if (!isObject(value)) {
    return {};
  }
  return _.omit(
    {
      ...parseBinding(value),
      valueFieldId: parseId(value.valueFieldId),
      defaultVersion: isVersionChoice(value.defaultVersion)
        ? value.defaultVersion
        : undefined,
    },
    (entry) => entry === undefined,
  );
}

function parseRelationship(value: unknown): Partial<RelationshipVersioning> {
  if (!isObject(value)) {
    return {};
  }
  const attributeVersions = isObject(value.attributeVersions)
    ? Object.fromEntries(
        Object.entries(value.attributeVersions).filter(
          (entry): entry is [string, VersionChoice] =>
            isVersionChoice(entry[1]),
        ),
      )
    : undefined;
  return _.omit(
    {
      ...parseBinding(value),
      version: isVersionChoice(value.version) ? value.version : undefined,
      asOfFieldId: parseId(value.asOfFieldId),
      attributeVersions,
    },
    (entry) => entry === undefined,
  );
}

function parseState(value: unknown): ChangingAttributesState {
  if (!isObject(value)) {
    return {
      variant: "attribute",
      attributes: {},
      relationships: {},
      dimensionVersions: {},
      columnPairs: {},
      measureVersions: {},
    };
  }
  return {
    variant:
      SCD_PROTOTYPE_VARIANTS.find((variant) => variant === value.variant) ??
      "attribute",
    attributes: isObject(value.attributes)
      ? _.mapObject(value.attributes, parseAttribute)
      : {},
    relationships: isObject(value.relationships)
      ? _.mapObject(value.relationships, parseRelationship)
      : {},
    dimensionVersions: parseRecord(value.dimensionVersions, isVersionChoice),
    columnPairs: isObject(value.columnPairs)
      ? _.mapObject(value.columnPairs, parseColumnPair)
      : {},
    measureVersions: parseRecord(value.measureVersions, isVersionChoice),
  };
}

const idOf = (field: Field | undefined) =>
  field ? getRawTableFieldId(field) : null;

export function isHistoryTableName(table: Pick<Table, "name">) {
  return HISTORY_NAME_RE.test(table.name.toLowerCase());
}

export function getHistoryTableCandidates(
  dimensionTable: Pick<Table, "id" | "name">,
  tables: Table[],
  isHistoryTable: (table: Table) => boolean = isHistoryTableName,
): Table[] {
  const base = singular(dimensionTable.name);
  return _.sortBy(
    tables.filter(
      (other) => other.id !== dimensionTable.id && isHistoryTable(other),
    ),
    (other) => (other.name.toLowerCase().startsWith(base) ? 0 : 1),
  );
}

export function getDimensionTableForHistory(
  historyTable: Table,
  tables: Table[],
): Table | undefined {
  const historyName = historyTable.name.toLowerCase();
  const dimensions = tables.filter(
    (table) =>
      table.id !== historyTable.id &&
      !isHistoryTableName(table) &&
      getTrackedAttributes(table, historyTable).length > 0,
  );
  return _.sortBy(dimensions, (table) =>
    historyName.startsWith(singular(table.name)) ? 0 : 1,
  )[0];
}

export function getTrackedAttributes(
  dimensionTable: Pick<Table, "fields">,
  historyTable: Pick<Table, "fields"> | undefined,
): Field[] {
  return (dimensionTable.fields ?? []).filter(
    (field) =>
      !isPK(field) &&
      !isFK(field) &&
      findColumnByName(historyTable, field) != null,
  );
}

export function inferKeyField(
  dimensionTable: Pick<Table, "name" | "fields">,
  historyTable: Pick<Table, "fields"> | undefined,
): Field | undefined {
  const fields = historyTable?.fields ?? [];
  const pkIds = (dimensionTable.fields ?? []).filter(isPK).map(idOf);
  const base = singular(dimensionTable.name);
  return (
    fields.find(
      (field) =>
        isFK(field) && pkIds.includes(field.fk_target_field_id ?? null),
    ) ??
    fields.find((field) => nameOf(field) === `${base}_id`) ??
    fields.find((field) => !isPK(field) && nameOf(field).endsWith("_id"))
  );
}

export function inferPastValuesBinding(
  dimensionTable: Pick<Table, "id" | "name" | "fields">,
  tables: Table[],
  hasColumn: (historyTable: Table) => boolean = () => true,
): PastValuesBinding {
  const historyTable = getHistoryTableCandidates(dimensionTable, tables).find(
    hasColumn,
  );
  if (historyTable == null) {
    return NO_PAST_VALUES;
  }
  return {
    source: "history-table",
    ...inferBindingForHistoryTable(dimensionTable, historyTable),
  };
}

export function inferBindingForHistoryTable(
  dimensionTable: Pick<Table, "name" | "fields">,
  historyTable: Table,
): Omit<PastValuesBinding, "source"> {
  const binding = inferHistoryBinding(historyTable.fields ?? []);
  return {
    historyTableId: historyTable.id,
    keyFieldId: idOf(inferKeyField(dimensionTable, historyTable)),
    validFromFieldId: binding.validFromFieldId,
    validToFieldId: binding.validToFieldId,
  };
}

export function findColumnByName(
  table: Pick<Table, "fields"> | undefined,
  field: Pick<Field, "name">,
) {
  return table?.fields?.find((other) => nameOf(other) === nameOf(field));
}

export function getEventDateFields(table: Pick<Table, "fields">) {
  return (table.fields ?? []).filter(isDate);
}

export function inferEventDateField(table: Pick<Table, "fields">) {
  const dates = getEventDateFields(table);
  return (
    dates.find((field) =>
      /(created|ordered|placed|order_date)/.test(nameOf(field)),
    ) ?? dates[0]
  );
}

export function getReferencingFields(
  dimensionTable: Pick<Table, "fields">,
  tables: Table[],
): { table: Table; field: Field }[] {
  const pkIds = (dimensionTable.fields ?? []).filter(isPK).map(idOf);
  return tables.flatMap((table) =>
    (table.fields ?? [])
      .filter(
        (field) =>
          isFK(field) &&
          field.fk_target_field_id != null &&
          pkIds.includes(field.fk_target_field_id) &&
          !isHistoryTableName(table),
      )
      .map((field) => ({ table, field })),
  );
}

export function getVersionChoiceOptions(
  noun: string,
  eventNoun: string,
  dateName: string,
): { value: VersionChoice; label: string; description: string }[] {
  return [
    {
      value: "at-event",
      label: t`As of the ${eventNoun}'s ${dateName}`,
      description: t`Each ${eventNoun} shows the ${noun} it had back then.`,
    },
    {
      value: "current",
      label: t`Current value`,
      description: t`Every ${eventNoun} shows today's ${noun}, even old ones.`,
    },
  ];
}

const attributeKey = (field: Field) => String(getRawTableFieldId(field));

export function useChangingAttributes() {
  const [state, updateState] = usePrototypeStorage(STORAGE_KEY, parseState);

  const getAttribute = useCallback(
    (
      field: Field,
      dimensionTable: Table,
      tables: Table[],
    ): ChangingAttribute => {
      const overrides = state.attributes[attributeKey(field)] ?? {};
      const inferred = inferPastValuesBinding(
        dimensionTable,
        tables,
        (other) => findColumnByName(other, field) != null,
      );
      const binding = { ...inferred, ...overrides };
      const historyTable = tables.find(
        (table) => table.id === binding.historyTableId,
      );
      return {
        ...binding,
        valueFieldId:
          overrides.valueFieldId !== undefined
            ? overrides.valueFieldId
            : idOf(findColumnByName(historyTable, field)),
        defaultVersion: overrides.defaultVersion ?? "at-event",
      };
    },
    [state],
  );

  const setAttribute = useCallback(
    (field: Field, update: Partial<ChangingAttribute>) =>
      updateState((current) => ({
        ...current,
        attributes: {
          ...current.attributes,
          [attributeKey(field)]: {
            ...current.attributes[attributeKey(field)],
            ...update,
          },
        },
      })),
    [updateState],
  );

  const getRelationship = useCallback(
    (
      fkField: Field,
      factTable: Table,
      dimensionTable: Table | undefined,
      tables: Table[],
    ): RelationshipVersioning => {
      const overrides = state.relationships[attributeKey(fkField)] ?? {};
      const inferred = dimensionTable
        ? inferPastValuesBinding(dimensionTable, tables)
        : NO_PAST_VALUES;
      return {
        ...inferred,
        version: "at-event",
        asOfFieldId: idOf(inferEventDateField(factTable)),
        attributeVersions: {},
        ...overrides,
      };
    },
    [state],
  );

  const setRelationship = useCallback(
    (fkField: Field, update: Partial<RelationshipVersioning>) =>
      updateState((current) => ({
        ...current,
        relationships: {
          ...current.relationships,
          [attributeKey(fkField)]: {
            ...current.relationships[attributeKey(fkField)],
            ...update,
          },
        },
      })),
    [updateState],
  );

  const setVariant = useCallback(
    (variant: ScdPrototypeVariant) =>
      updateState((current) => ({ ...current, variant })),
    [updateState],
  );

  const getDimensionVersion = useCallback(
    (table: Pick<Table, "id">): VersionChoice =>
      state.dimensionVersions[String(table.id)] ?? "at-event",
    [state],
  );

  const setDimensionVersion = useCallback(
    (table: Pick<Table, "id">, version: VersionChoice) =>
      updateState((current) => ({
        ...current,
        dimensionVersions: {
          ...current.dimensionVersions,
          [String(table.id)]: version,
        },
      })),
    [updateState],
  );

  const getColumnPair = useCallback(
    (field: Field): ColumnPair => ({
      ...DEFAULT_COLUMN_PAIR,
      ...state.columnPairs[attributeKey(field)],
    }),
    [state],
  );

  const setColumnPair = useCallback(
    (field: Field, update: Partial<ColumnPair>) =>
      updateState((current) => ({
        ...current,
        columnPairs: {
          ...current.columnPairs,
          [attributeKey(field)]: {
            ...current.columnPairs[attributeKey(field)],
            ...update,
          },
        },
      })),
    [updateState],
  );

  const getMeasureVersion = useCallback(
    (measureId: MeasureId): VersionChoice =>
      state.measureVersions[String(measureId)] ?? "at-event",
    [state],
  );

  const setMeasureVersion = useCallback(
    (measureId: MeasureId, version: VersionChoice) =>
      updateState((current) => ({
        ...current,
        measureVersions: {
          ...current.measureVersions,
          [String(measureId)]: version,
        },
      })),
    [updateState],
  );

  return {
    variant: state.variant,
    setVariant,
    getDimensionVersion,
    setDimensionVersion,
    getColumnPair,
    setColumnPair,
    getMeasureVersion,
    setMeasureVersion,
    getAttribute,
    setAttribute,
    getRelationship,
    setRelationship,
  };
}

export function findFieldById(
  table: Pick<Table, "fields"> | undefined,
  fieldId: FieldId | null,
) {
  return fieldId == null
    ? undefined
    : table?.fields?.find((field) => getRawTableFieldId(field) === fieldId);
}
