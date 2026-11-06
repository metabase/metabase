import { useCallback } from "react";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import type { MeasureId, Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

/** What made the group: sync's suggestion by measure kind, a pack, or an admin */
export type MeasureGroupSource = "suggestion" | "pack" | "admin";

/**
 * A named, ordered set of a table's measures: the spec's measure_group.
 * It only changes how measures are listed; it has no query meaning.
 */
export type MeasureGroup = {
  id: string;
  name: string;
  /** In display order */
  measureIds: MeasureId[];
  source: MeasureGroupSource;
};

type TableMeasureGroups = {
  groups: MeasureGroup[];
  /** Proposals an admin accepted or dismissed, so they don't come back */
  resolvedProposalKeys: string[];
};

type MeasureGroupsState = Record<string, TableMeasureGroups>;

// PROTOTYPE: mocked. There's no measure_group table yet, so groups live in
// localStorage. Their members are real measures.
const STORAGE_KEY = "metabase-prototype-measure-groups";

const EMPTY_TABLE: TableMeasureGroups = {
  groups: [],
  resolvedProposalKeys: [],
};

const SOURCES: MeasureGroupSource[] = ["suggestion", "pack", "admin"];

function parseGroup(value: unknown): MeasureGroup | null {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !Array.isArray(value.measureIds)
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    measureIds: value.measureIds.filter(
      (id): id is MeasureId => typeof id === "number",
    ),
    source: SOURCES.find((known) => known === value.source) ?? "admin",
  };
}

function parseTable(value: unknown): TableMeasureGroups {
  if (!isObject(value)) {
    return EMPTY_TABLE;
  }
  return {
    groups: Array.isArray(value.groups)
      ? value.groups
          .map(parseGroup)
          .filter((group): group is MeasureGroup => group != null)
      : [],
    resolvedProposalKeys: Array.isArray(value.resolvedProposalKeys)
      ? value.resolvedProposalKeys.filter(
          (key): key is string => typeof key === "string",
        )
      : [],
  };
}

function parseState(value: unknown): MeasureGroupsState {
  return isObject(value) ? _.mapObject(value, parseTable) : {};
}

const getTableKey = (table: Pick<Table, "db_id" | "id">) =>
  `${table.db_id}:${table.id}`;

export const createMeasureGroupId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Each table's measure groups, and the proposals an admin already handled */
export function useMeasureGroups() {
  const [state, updateState] = usePrototypeStorage(STORAGE_KEY, parseState);

  const getTable = useCallback(
    (table: Pick<Table, "db_id" | "id">) =>
      state[getTableKey(table)] ?? EMPTY_TABLE,
    [state],
  );

  const getMeasureGroups = useCallback(
    (table: Pick<Table, "db_id" | "id">) => getTable(table).groups,
    [getTable],
  );

  const getResolvedProposalKeys = useCallback(
    (table: Pick<Table, "db_id" | "id">) =>
      getTable(table).resolvedProposalKeys,
    [getTable],
  );

  const updateTable = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      update: (current: TableMeasureGroups) => TableMeasureGroups,
    ) => {
      const tableKey = getTableKey(table);
      updateState((current) => ({
        ...current,
        [tableKey]: update(current[tableKey] ?? EMPTY_TABLE),
      }));
    },
    [updateState],
  );

  /** Adds the group, or replaces the one with its id */
  const saveMeasureGroup = useCallback(
    (table: Pick<Table, "db_id" | "id">, group: MeasureGroup) =>
      updateTable(table, (current) => {
        const exists = current.groups.some(({ id }) => id === group.id);
        return {
          ...current,
          groups: exists
            ? current.groups.map((known) =>
                known.id === group.id ? group : known,
              )
            : [...current.groups, group],
        };
      }),
    [updateTable],
  );

  const deleteMeasureGroup = useCallback(
    (table: Pick<Table, "db_id" | "id">, groupId: string) =>
      updateTable(table, (current) => ({
        ...current,
        groups: current.groups.filter(({ id }) => id !== groupId),
      })),
    [updateTable],
  );

  const resolveProposal = useCallback(
    (table: Pick<Table, "db_id" | "id">, key: string) =>
      updateTable(table, (current) => ({
        ...current,
        resolvedProposalKeys: _.uniq([...current.resolvedProposalKeys, key]),
      })),
    [updateTable],
  );

  return {
    getMeasureGroups,
    getResolvedProposalKeys,
    saveMeasureGroup,
    deleteMeasureGroup,
    resolveProposal,
  };
}
