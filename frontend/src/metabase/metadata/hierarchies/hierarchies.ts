import { useCallback } from "react";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import type { FieldId, Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

/**
 * Fixed: every row has every level. Ragged: some rows skip a level.
 * Recursive: rows point to a parent row in the same table.
 */
export type HierarchyKind = "fixed" | "ragged" | "recursive";

export const HIERARCHY_KINDS: HierarchyKind[] = [
  "fixed",
  "ragged",
  "recursive",
];

/** A level's column: one of the table's, or one reached through a foreign key */
export type HierarchyLevel = {
  fieldId: FieldId;
  /** The foreign key on this table that reaches the level's column */
  viaFieldId?: FieldId;
};

/** A member with no children: no expand toggle, or an empty child row */
export type LeafDisplay = "leaf" | "empty_child";

export type HierarchySource = "sync" | "admin";

/** The spec's hierarchy object (doc 06), with its display options */
export type Hierarchy = {
  id: string;
  name: string;
  kind: HierarchyKind;
  /** Top level first; for fixed and ragged hierarchies */
  levels: HierarchyLevel[];
  /** For recursive hierarchies: the column that points to the parent row */
  parentKeyFieldId?: FieldId;
  depthFieldId?: FieldId;
  pathFieldId?: FieldId;
  /** The level questions start at; the top level when unset */
  defaultLevelFieldId?: FieldId;
  leafDisplay: LeafDisplay;
  offerDrill: boolean;
  offerTreeFilter: boolean;
  hideLevelColumns: boolean;
  source: HierarchySource;
  /** What sync made it from, so sync doesn't make it again once it's changed or deleted */
  syncKey?: string;
};

type TableHierarchies = {
  hierarchies: Hierarchy[];
  /** Proposals an admin accepted or dismissed, so they don't come back */
  resolvedProposalKeys: string[];
};

type HierarchiesState = Record<string, TableHierarchies>;

// PROTOTYPE: mocked. There's no hierarchy table yet, so hierarchies live in
// localStorage. Their levels are real fields.
const STORAGE_KEY = "metabase-prototype-hierarchies";

const EMPTY_TABLE: TableHierarchies = {
  hierarchies: [],
  resolvedProposalKeys: [],
};

const optionalNumber = (value: unknown) =>
  typeof value === "number" ? value : undefined;

function parseLevel(value: unknown): HierarchyLevel | null {
  if (!isObject(value) || typeof value.fieldId !== "number") {
    return null;
  }
  return {
    fieldId: value.fieldId,
    viaFieldId: optionalNumber(value.viaFieldId),
  };
}

function parseHierarchy(value: unknown): Hierarchy | null {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string"
  ) {
    return null;
  }
  const levels: unknown[] = Array.isArray(value.levels) ? value.levels : [];
  return {
    id: value.id,
    name: value.name,
    kind: HIERARCHY_KINDS.find((kind) => kind === value.kind) ?? "fixed",
    levels: levels
      .map(parseLevel)
      .filter((level): level is HierarchyLevel => level != null),
    parentKeyFieldId: optionalNumber(value.parentKeyFieldId),
    depthFieldId: optionalNumber(value.depthFieldId),
    pathFieldId: optionalNumber(value.pathFieldId),
    defaultLevelFieldId: optionalNumber(value.defaultLevelFieldId),
    leafDisplay: value.leafDisplay === "empty_child" ? "empty_child" : "leaf",
    offerDrill: value.offerDrill !== false,
    offerTreeFilter: value.offerTreeFilter !== false,
    hideLevelColumns: value.hideLevelColumns === true,
    source: value.source === "sync" ? "sync" : "admin",
    syncKey: typeof value.syncKey === "string" ? value.syncKey : undefined,
  };
}

function parseTable(value: unknown): TableHierarchies {
  if (!isObject(value)) {
    return EMPTY_TABLE;
  }
  const hierarchies: unknown[] = Array.isArray(value.hierarchies)
    ? value.hierarchies
    : [];
  const keys: unknown[] = Array.isArray(value.resolvedProposalKeys)
    ? value.resolvedProposalKeys
    : [];
  return {
    hierarchies: hierarchies
      .map(parseHierarchy)
      .filter((hierarchy): hierarchy is Hierarchy => hierarchy != null),
    resolvedProposalKeys: keys.filter(
      (key): key is string => typeof key === "string",
    ),
  };
}

function parseState(value: unknown): HierarchiesState {
  return isObject(value) ? _.mapObject(value, parseTable) : {};
}

const getTableKey = (table: Pick<Table, "db_id" | "id">) =>
  `${table.db_id}:${table.id}`;

export const createHierarchyId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * For level hierarchies, a member with no child is one whose lower levels are
 * all missing, so it follows the missing-level choice: skipping gaps ends the
 * branch, showing them adds an empty row. Parent-and-child ones keep their own.
 */
export const getLeafDisplay = (
  kind: HierarchyKind,
  leafDisplay: LeafDisplay,
): LeafDisplay =>
  kind === "recursive"
    ? leafDisplay
    : kind === "ragged"
      ? "leaf"
      : "empty_child";

/** The display options a new hierarchy starts with, per doc 06's defaults */
export const DEFAULT_HIERARCHY_OPTIONS = {
  leafDisplay: "leaf",
  offerDrill: true,
  offerTreeFilter: true,
  hideLevelColumns: false,
} satisfies Pick<
  Hierarchy,
  "leafDisplay" | "offerDrill" | "offerTreeFilter" | "hideLevelColumns"
>;

/** Each table's hierarchies, and the proposals an admin already handled */
export function useHierarchies() {
  const [state, updateState] = usePrototypeStorage(STORAGE_KEY, parseState);

  const getTable = useCallback(
    (table: Pick<Table, "db_id" | "id">) =>
      state[getTableKey(table)] ?? EMPTY_TABLE,
    [state],
  );

  const getHierarchies = useCallback(
    (table: Pick<Table, "db_id" | "id">) => getTable(table).hierarchies,
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
      update: (current: TableHierarchies) => TableHierarchies,
    ) => {
      const tableKey = getTableKey(table);
      updateState((current) => ({
        ...current,
        [tableKey]: update(current[tableKey] ?? EMPTY_TABLE),
      }));
    },
    [updateState],
  );

  /** Adds the hierarchy, or replaces the one with its id */
  const saveHierarchy = useCallback(
    (table: Pick<Table, "db_id" | "id">, hierarchy: Hierarchy) =>
      updateTable(table, (current) => {
        const exists = current.hierarchies.some(
          ({ id }) => id === hierarchy.id,
        );
        return {
          ...current,
          hierarchies: exists
            ? current.hierarchies.map((known) =>
                known.id === hierarchy.id ? hierarchy : known,
              )
            : [...current.hierarchies, hierarchy],
        };
      }),
    [updateTable],
  );

  const deleteHierarchy = useCallback(
    (table: Pick<Table, "db_id" | "id">, hierarchyId: string) =>
      updateTable(table, (current) => ({
        ...current,
        hierarchies: current.hierarchies.filter(({ id }) => id !== hierarchyId),
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
    getHierarchies,
    getResolvedProposalKeys,
    saveHierarchy,
    deleteHierarchy,
    resolveProposal,
  };
}

/** Where a field sits in a table's hierarchies: as a level, or as a parent key */
export type FieldHierarchyPlace =
  | { type: "level"; hierarchy: Hierarchy; levelIndex: number }
  | { type: "parent-key"; hierarchy: Hierarchy };

export function getFieldHierarchyPlaces(
  hierarchies: Hierarchy[],
  fieldId: FieldId,
): FieldHierarchyPlace[] {
  return hierarchies.flatMap((hierarchy): FieldHierarchyPlace[] => {
    if (hierarchy.kind === "recursive") {
      return hierarchy.parentKeyFieldId === fieldId
        ? [{ type: "parent-key", hierarchy }]
        : [];
    }
    const levelIndex = hierarchy.levels.findIndex(
      (level) => level.viaFieldId == null && level.fieldId === fieldId,
    );
    return levelIndex >= 0 ? [{ type: "level", hierarchy, levelIndex }] : [];
  });
}
