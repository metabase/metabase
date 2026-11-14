import { useCallback } from "react";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import type { FieldId, Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  type StatusHistoryBinding,
  TRANSITION_KINDS,
  type TransitionKind,
} from "./process";
import {
  ENUM_KINDS,
  type EnumKind,
  type OrderedValue,
  VALUE_BUCKETS,
} from "./value-order";

/** What an admin set on a field; absent means sync's inference */
export type FieldLifecycleOverrides = {
  enumKind?: EnumKind;
  /** The values in lifecycle order, with their buckets */
  values?: OrderedValue[];
};

/** What an admin set on a table's process */
export type TableProcessOverrides = {
  /** `null` means an admin said the table has no status column */
  statusFieldId?: FieldId | null;
  /** `null` means an admin said there's no status history table */
  history?: StatusHistoryBinding | null;
  transitionKinds: Record<string, TransitionKind>;
};

type LifecycleState = {
  fields: Record<string, FieldLifecycleOverrides>;
  tables: Record<string, TableProcessOverrides>;
};

// PROTOTYPE: mocked. There's no enum_kind, value_meta, or process_definition
// column yet, so admin choices live in localStorage.
const STORAGE_KEY = "metabase-prototype-lifecycle";

const EMPTY_PROCESS: TableProcessOverrides = { transitionKinds: {} };

const parseFieldId = (value: unknown): FieldId | null =>
  typeof value === "number" ? value : null;

function parseOrderedValues(value: unknown): OrderedValue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((entry): OrderedValue[] => {
    if (!isObject(entry) || typeof entry.value !== "string") {
      return [];
    }
    const bucket = VALUE_BUCKETS.find((bucket) => bucket === entry.bucket);
    return [{ value: entry.value, bucket: bucket ?? "other" }];
  });
}

function parseFieldOverrides(value: unknown): FieldLifecycleOverrides {
  if (!isObject(value)) {
    return {};
  }
  return {
    enumKind: ENUM_KINDS.find((kind) => kind === value.enumKind),
    values: parseOrderedValues(value.values),
  };
}

function parseHistory(value: unknown): StatusHistoryBinding | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isObject(value) || typeof value.tableId !== "number") {
    return undefined;
  }
  return {
    tableId: value.tableId,
    entityKeyFieldId: parseFieldId(value.entityKeyFieldId),
    stateFieldId: parseFieldId(value.stateFieldId),
    changedAtFieldId: parseFieldId(value.changedAtFieldId),
  };
}

function parseTableOverrides(value: unknown): TableProcessOverrides {
  if (!isObject(value)) {
    return EMPTY_PROCESS;
  }
  const transitionKinds = isObject(value.transitionKinds)
    ? Object.fromEntries(
        Object.entries(value.transitionKinds).flatMap(([key, kind]) => {
          const parsed = TRANSITION_KINDS.find((known) => known === kind);
          return parsed ? [[key, parsed]] : [];
        }),
      )
    : {};
  return {
    statusFieldId:
      value.statusFieldId === null
        ? null
        : typeof value.statusFieldId === "number"
          ? value.statusFieldId
          : undefined,
    history: parseHistory(value.history),
    transitionKinds,
  };
}

function parseState(value: unknown): LifecycleState {
  if (!isObject(value)) {
    return { fields: {}, tables: {} };
  }
  return {
    fields: isObject(value.fields)
      ? _.mapObject(value.fields, parseFieldOverrides)
      : {},
    tables: isObject(value.tables)
      ? _.mapObject(value.tables, parseTableOverrides)
      : {},
  };
}

const getTableKey = (table: Pick<Table, "db_id" | "id">) =>
  `${table.db_id}:${table.id}`;

/**
 * Fields' value kinds and lifecycle orders, and tables' processes, as an
 * admin set them. A field's order is also its table's process states.
 */
export function useLifecycle() {
  const [state, updateState] = usePrototypeStorage(STORAGE_KEY, parseState);

  const getFieldLifecycle = useCallback(
    (fieldId: FieldId): FieldLifecycleOverrides =>
      state.fields[String(fieldId)] ?? {},
    [state],
  );

  const getTableProcess = useCallback(
    (table: Pick<Table, "db_id" | "id">): TableProcessOverrides =>
      state.tables[getTableKey(table)] ?? EMPTY_PROCESS,
    [state],
  );

  const updateField = useCallback(
    (fieldId: FieldId, change: FieldLifecycleOverrides) =>
      updateState((current) => ({
        ...current,
        fields: {
          ...current.fields,
          [String(fieldId)]: _.omit(
            { ...current.fields[String(fieldId)], ...change },
            (value) => value === undefined,
          ),
        },
      })),
    [updateState],
  );

  const updateTable = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      update: (process: TableProcessOverrides) => TableProcessOverrides,
    ) => {
      const tableKey = getTableKey(table);
      updateState((current) => ({
        ...current,
        tables: {
          ...current.tables,
          [tableKey]: update(current.tables[tableKey] ?? EMPTY_PROCESS),
        },
      }));
    },
    [updateState],
  );

  /** `undefined` goes back to the inferred kind */
  const setEnumKind = useCallback(
    (fieldId: FieldId, enumKind: EnumKind | undefined) =>
      updateField(fieldId, { enumKind }),
    [updateField],
  );

  /** `undefined` goes back to the inferred order */
  const setValueOrder = useCallback(
    (fieldId: FieldId, values: OrderedValue[] | undefined) =>
      updateField(fieldId, { values }),
    [updateField],
  );

  /** `null` sets none; `undefined` goes back to the inferred one */
  const setStatusFieldId = useCallback(
    (table: Pick<Table, "db_id" | "id">, statusFieldId: FieldId | null) =>
      updateTable(table, (process) => ({ ...process, statusFieldId })),
    [updateTable],
  );

  /** `null` sets none; `undefined` goes back to the inferred one */
  const setStatusHistory = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      history: StatusHistoryBinding | null,
    ) => updateTable(table, (process) => ({ ...process, history })),
    [updateTable],
  );

  const setTransitionKind = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      transitionKey: string,
      kind: TransitionKind,
    ) =>
      updateTable(table, (process) => ({
        ...process,
        transitionKinds: { ...process.transitionKinds, [transitionKey]: kind },
      })),
    [updateTable],
  );

  return {
    getFieldLifecycle,
    getTableProcess,
    setEnumKind,
    setValueOrder,
    setStatusFieldId,
    setStatusHistory,
    setTransitionKind,
  };
}
