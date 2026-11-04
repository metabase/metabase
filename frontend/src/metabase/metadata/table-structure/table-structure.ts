import { useCallback } from "react";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ConcreteTableId,
  Field,
  FieldId,
  Table,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  type EavBinding,
  type HistoryBinding,
  type MainDateInference,
  PERIOD_GRANULARITIES,
  type PeriodGranularity,
  type RoleInference,
  type RowIdentity,
  inferEavBinding,
  inferHistoryBinding,
  inferMainDate,
  inferPeriodGranularity,
  inferRowIdentity,
  inferTableRole,
} from "./inference";
import { type TableRole, isTableRole } from "./roles";

/** What an admin set; anything absent comes from sync's inference */
type TableStructureOverrides = {
  role?: TableRole;
  grainDescription?: string;
  periodGranularity?: PeriodGranularity;
  history?: Partial<HistoryBinding>;
  eav?: Partial<EavBinding>;
  /** `null` means an admin said the table has no main date */
  mainDateFieldId?: FieldId | null;
};

type TableStructureState = {
  tables: Record<string, TableStructureOverrides>;
  /** Fields without an entry are grain fields when they're primary keys */
  grainByField: Record<string, boolean>;
};

/** A table's structure as people see it: admin overrides over sync's inference */
export type TableStructure = {
  role: TableRole | null;
  inference: RoleInference;
  isRoleOverridden: boolean;
  needsReview: boolean;
  grainFields: Field[];
  grainDescription: string;
  rowIdentity: RowIdentity;
  periodGranularity: PeriodGranularity;
  history: HistoryBinding;
  eav: EavBinding;
  eavOverrides: Partial<EavBinding>;
  /** `undefined` when the table has no main date */
  mainDateField: Field | undefined;
  mainDateInference: MainDateInference;
  isMainDateOverridden: boolean;
};

// PROTOTYPE: mocked. There's no table_role, grain, or binding column yet, so
// admin overrides live in localStorage and the rest is inferred in the browser.
const STORAGE_KEY = "metabase-prototype-table-structure";

const parseFieldId = (value: unknown): FieldId | null | undefined =>
  value === null || typeof value === "number" ? value : undefined;

const parseTableId = (value: unknown): ConcreteTableId | null | undefined =>
  value === null || typeof value === "number" ? value : undefined;

const parseBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

function parseHistoryBinding(value: unknown): Partial<HistoryBinding> {
  if (!isObject(value)) {
    return {};
  }
  return {
    durableKeyFieldId: parseFieldId(value.durableKeyFieldId),
    validFromFieldId: parseFieldId(value.validFromFieldId),
    validToFieldId: parseFieldId(value.validToFieldId),
    currentFlagFieldId: parseFieldId(value.currentFlagFieldId),
    currentRowsOnly: parseBoolean(value.currentRowsOnly),
  };
}

function parseEavBinding(value: unknown): Partial<EavBinding> {
  if (!isObject(value)) {
    return {};
  }
  return {
    entityKeyFieldId: parseFieldId(value.entityKeyFieldId),
    propertyFieldId: parseFieldId(value.propertyFieldId),
    valueFieldId: parseFieldId(value.valueFieldId),
    definitionTableId: parseTableId(value.definitionTableId),
    labelFieldId: parseFieldId(value.labelFieldId),
    typeFieldId: parseFieldId(value.typeFieldId),
  };
}

function parseOverrides(value: unknown): TableStructureOverrides {
  if (!isObject(value)) {
    return {};
  }
  const granularity = PERIOD_GRANULARITIES.find(
    (granularity) => granularity === value.periodGranularity,
  );
  return {
    role: isTableRole(value.role) ? value.role : undefined,
    grainDescription:
      typeof value.grainDescription === "string"
        ? value.grainDescription
        : undefined,
    periodGranularity: granularity,
    history: parseHistoryBinding(value.history),
    eav: parseEavBinding(value.eav),
    mainDateFieldId: parseFieldId(value.mainDateFieldId),
  };
}

function parseState(value: unknown): TableStructureState {
  if (!isObject(value)) {
    return { tables: {}, grainByField: {} };
  }
  const tables = isObject(value.tables)
    ? _.mapObject(value.tables, parseOverrides)
    : {};
  const grainByField = isObject(value.grainByField)
    ? Object.fromEntries(
        Object.entries(value.grainByField).filter(
          (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
        ),
      )
    : {};
  return { tables, grainByField };
}

function getTableKey(table: Pick<Table, "db_id" | "id">) {
  return `${table.db_id}:${table.id}`;
}

function getFieldKey(field: Field) {
  return String(getRawTableFieldId(field));
}

/** Override value wins when it's set, including an explicit `null` */
function withOverrides<T extends object>(
  inferred: T,
  overrides?: Partial<T>,
): T {
  return {
    ...inferred,
    ..._.omit(overrides ?? {}, (value) => value === undefined),
  };
}

/**
 * Every table's role, grain, and history or custom-property binding. Values an
 * admin set win; the rest is inferred from the table's keys, columns, and name.
 */
export function useTableStructures() {
  const [state, updateState] = usePrototypeStorage(STORAGE_KEY, parseState);

  const isGrainField = useCallback(
    (field: Field): boolean =>
      state.grainByField[getFieldKey(field)] ?? isPK(field),
    [state],
  );

  const getTableStructure = useCallback(
    (table: Pick<Table, "db_id" | "id" | "name"> & { fields?: Field[] }) => {
      const fields = table.fields ?? [];
      const shape = { name: table.name, fields };
      const overrides = state.tables[getTableKey(table)] ?? {};
      const inference = inferTableRole(shape);
      const role = overrides.role ?? inference.role;
      const structure: TableStructure = {
        role,
        inference,
        isRoleOverridden: overrides.role != null,
        // A weak guess needs confirming; no guess at all is its own to-do
        needsReview:
          overrides.role == null &&
          inference.role != null &&
          inference.confidence === "low",
        grainFields: _.sortBy(
          fields.filter((field) => isGrainField(field)),
          (field) => field.position,
        ),
        grainDescription: overrides.grainDescription ?? "",
        rowIdentity: inferRowIdentity(fields),
        periodGranularity:
          overrides.periodGranularity ?? inferPeriodGranularity(shape),
        history: withOverrides(inferHistoryBinding(fields), overrides.history),
        eav: withOverrides(inferEavBinding(fields), overrides.eav),
        eavOverrides: overrides.eav ?? {},
        ...resolveMainDate(fields, role, overrides.mainDateFieldId),
      };
      return structure;
    },
    [state, isGrainField],
  );

  const updateOverrides = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      update: (overrides: TableStructureOverrides) => TableStructureOverrides,
    ) => {
      const tableKey = getTableKey(table);
      updateState((current) => ({
        ...current,
        tables: {
          ...current.tables,
          [tableKey]: update(current.tables[tableKey] ?? {}),
        },
      }));
    },
    [updateState],
  );

  /** `null` goes back to the inferred role */
  const setTableRole = useCallback(
    (table: Pick<Table, "db_id" | "id">, role: TableRole | null) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        role: role ?? undefined,
      })),
    [updateOverrides],
  );

  const setGrainDescription = useCallback(
    (table: Pick<Table, "db_id" | "id">, grainDescription: string) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        grainDescription: grainDescription || undefined,
      })),
    [updateOverrides],
  );

  const setPeriodGranularity = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      periodGranularity: PeriodGranularity,
    ) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        periodGranularity,
      })),
    [updateOverrides],
  );

  const setHistoryBinding = useCallback(
    (table: Pick<Table, "db_id" | "id">, history: Partial<HistoryBinding>) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        history: { ...overrides.history, ...history },
      })),
    [updateOverrides],
  );

  const setEavBinding = useCallback(
    (table: Pick<Table, "db_id" | "id">, eav: Partial<EavBinding>) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        eav: { ...overrides.eav, ...eav },
      })),
    [updateOverrides],
  );

  /** `undefined` goes back to the inferred main date; `null` sets none */
  const setMainDate = useCallback(
    (table: Pick<Table, "db_id" | "id">, fieldId: FieldId | null | undefined) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        mainDateFieldId: fieldId,
      })),
    [updateOverrides],
  );

  /** `null` goes back to the default: grain fields are the primary key */
  const setFieldGrain = useCallback(
    (field: Field, isGrain: boolean | null) => {
      const fieldKey = getFieldKey(field);
      updateState((current) => ({
        ...current,
        grainByField:
          isGrain == null
            ? _.omit(current.grainByField, fieldKey)
            : { ...current.grainByField, [fieldKey]: isGrain },
      }));
    },
    [updateState],
  );

  return {
    getTableStructure,
    isGrainField,
    setTableRole,
    setGrainDescription,
    setPeriodGranularity,
    setHistoryBinding,
    setEavBinding,
    setMainDate,
    setFieldGrain,
  };
}

function resolveMainDate(
  fields: Field[],
  role: TableRole | null,
  overrideFieldId: FieldId | null | undefined,
): Pick<
  TableStructure,
  "mainDateField" | "mainDateInference" | "isMainDateOverridden"
> {
  const mainDateInference = inferMainDate(fields, role);
  const isMainDateOverridden = overrideFieldId !== undefined;
  const fieldId = isMainDateOverridden
    ? overrideFieldId
    : mainDateInference.fieldId;
  return {
    mainDateField: fields.find(
      (field) => fieldId != null && getRawTableFieldId(field) === fieldId,
    ),
    mainDateInference,
    isMainDateOverridden,
  };
}
