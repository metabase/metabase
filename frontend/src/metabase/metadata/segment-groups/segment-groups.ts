import { useCallback } from "react";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import {
  SYSTEM_SEGMENT_ROLES,
  type SystemSegmentRole,
} from "metabase/metadata/table-segments";
import type { FieldId, Segment, SegmentId, Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

/** Members of a partition never overlap; an overlapping group is a filter set */
export type SegmentGroupKind = "partition" | "overlapping";

export const SEGMENT_GROUP_KINDS: SegmentGroupKind[] = [
  "partition",
  "overlapping",
];

/** What made the group: a process's buckets, a flag, a kind column, or an admin */
export type SegmentGroupSource =
  | "process"
  | "flag"
  | "kind"
  | "suggested"
  | "admin";

/**
 * A custom segment, or one of the table's system segments. `label` is the
 * member's name in this group, which can differ from the segment's.
 */
export type SegmentGroupMember =
  | { segmentId: SegmentId; label: string }
  | { systemRole: SystemSegmentRole; label: string };

export function getSegmentGroupMemberKey(member: SegmentGroupMember): string {
  return "segmentId" in member
    ? `custom:${member.segmentId}`
    : `system:${member.systemRole}`;
}

export function isSegmentGroupMemberPresent(
  member: SegmentGroupMember,
  segments: Pick<Segment, "id">[],
): boolean {
  return (
    !("segmentId" in member) ||
    segments.some(({ id }) => id === member.segmentId)
  );
}

/**
 * A named, ordered set of segments on one table: the spec's segment_group.
 * Members are in order; "Other" takes the rows in no member, and comes last.
 */
export type SegmentGroup = {
  id: string;
  name: string;
  kind: SegmentGroupKind;
  members: SegmentGroupMember[];
  other: boolean;
  source: SegmentGroupSource;
  /** The column a sync-made group came from, so sync can update it in place */
  sourceFieldId?: FieldId;
  /** An admin edited a sync-made group, so sync leaves it alone */
  isAdminEdited?: boolean;
};

type TableSegmentGroups = {
  groups: SegmentGroup[];
  /** Proposals an admin accepted or dismissed, so they don't come back */
  resolvedProposalKeys: string[];
};

type SegmentGroupsState = Record<string, TableSegmentGroups>;

// PROTOTYPE: mocked. There's no segment_group table yet, so groups live in
// localStorage. Their members are real segments.
const STORAGE_KEY = "metabase-prototype-segment-groups";

const EMPTY_TABLE: TableSegmentGroups = {
  groups: [],
  resolvedProposalKeys: [],
};

const SOURCES: SegmentGroupSource[] = [
  "process",
  "flag",
  "kind",
  "suggested",
  "admin",
];

function parseMember(value: unknown): SegmentGroupMember | null {
  if (!isObject(value) || typeof value.label !== "string") {
    return null;
  }
  if (typeof value.segmentId === "number") {
    return { segmentId: value.segmentId, label: value.label };
  }
  const systemRole = SYSTEM_SEGMENT_ROLES.find(
    (role) => role === value.systemRole,
  );
  return systemRole ? { systemRole, label: value.label } : null;
}

function parseGroup(value: unknown): SegmentGroup | null {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !Array.isArray(value.members)
  ) {
    return null;
  }
  const kind = SEGMENT_GROUP_KINDS.find((known) => known === value.kind);
  const source = SOURCES.find((known) => known === value.source);
  return {
    id: value.id,
    name: value.name,
    kind: kind ?? "partition",
    members: value.members
      .map(parseMember)
      .filter((member): member is SegmentGroupMember => member != null),
    other: value.other === true,
    source: source ?? "admin",
    sourceFieldId:
      typeof value.sourceFieldId === "number" ? value.sourceFieldId : undefined,
    isAdminEdited: value.isAdminEdited === true,
  };
}

function parseTable(value: unknown): TableSegmentGroups {
  if (!isObject(value)) {
    return EMPTY_TABLE;
  }
  return {
    groups: Array.isArray(value.groups)
      ? value.groups
          .map(parseGroup)
          .filter((group): group is SegmentGroup => group != null)
      : [],
    resolvedProposalKeys: Array.isArray(value.resolvedProposalKeys)
      ? value.resolvedProposalKeys.filter(
          (key): key is string => typeof key === "string",
        )
      : [],
  };
}

function parseState(value: unknown): SegmentGroupsState {
  return isObject(value) ? _.mapObject(value, parseTable) : {};
}

const getTableKey = (table: Pick<Table, "db_id" | "id">) =>
  `${table.db_id}:${table.id}`;

export const createSegmentGroupId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Each table's segment groups, and the proposals an admin already handled */
export function useSegmentGroups() {
  const [state, updateState] = usePrototypeStorage(STORAGE_KEY, parseState);

  const getTable = useCallback(
    (table: Pick<Table, "db_id" | "id">) =>
      state[getTableKey(table)] ?? EMPTY_TABLE,
    [state],
  );

  const getSegmentGroups = useCallback(
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
      update: (current: TableSegmentGroups) => TableSegmentGroups,
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
  const saveSegmentGroup = useCallback(
    (table: Pick<Table, "db_id" | "id">, group: SegmentGroup) =>
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

  const deleteSegmentGroup = useCallback(
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
    getSegmentGroups,
    getResolvedProposalKeys,
    saveSegmentGroup,
    deleteSegmentGroup,
    resolveProposal,
  };
}
