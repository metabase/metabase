import { t } from "ttag";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isDate, isFK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table, TableId } from "metabase-types/api";

import { getStatusFields } from "./status-fields";
import { type OrderedValue, isTerminalBucket } from "./value-order";

/** How a process's states are recorded; the spec's process encoding */
export type ProcessEncoding =
  | "status"
  | "status+history"
  | "milestones"
  | "both";

export type TransitionKind = "typical" | "allowed" | "unexpected";

export const TRANSITION_KINDS: TransitionKind[] = [
  "typical",
  "allowed",
  "unexpected",
];

/** A separate table that records each change of an entity's status */
export type StatusHistoryBinding = {
  tableId: TableId;
  entityKeyFieldId: FieldId | null;
  stateFieldId: FieldId | null;
  changedAtFieldId: FieldId | null;
};

export type StatusHistoryInference = {
  binding: StatusHistoryBinding;
  signal: string;
};

export type Transition = { from: string; to: string };

export type InferredTransition = Transition & {
  kind: TransitionKind;
  signal: string;
};

export function getTransitionKindLabel(kind: TransitionKind): string {
  switch (kind) {
    case "typical":
      return t`Typical`;
    case "allowed":
      return t`Allowed`;
    case "unexpected":
      return t`Unexpected`;
  }
}

export function getProcessEncodingLabel(encoding: ProcessEncoding): string {
  switch (encoding) {
    case "status":
      return t`Status column`;
    case "status+history":
      return t`Status column and history table`;
    case "milestones":
      return t`Milestone dates`;
    case "both":
      return t`Status history and milestone dates`;
  }
}

export function getProcessEncoding(
  hasHistory: boolean,
  milestoneCount: number,
): ProcessEncoding {
  const hasMilestones = milestoneCount >= 2;
  if (hasHistory && hasMilestones) {
    return "both";
  }
  if (hasHistory) {
    return "status+history";
  }
  return hasMilestones ? "milestones" : "status";
}

export const getTransitionKey = ({ from, to }: Transition) =>
  `${from}\u0000${to}`;

const idOf = (field: Field) => getRawTableFieldId(field);
const nameOf = (field: Field) => field.name.toLowerCase();
const HISTORY_RE = /^(.+?)_(status|stage|state)_history$/;
const CHANGED_AT_RE =
  /^(changed_at|change_date|changed_on|entered_at|occurred_at|valid_from|timestamp|updated_at|created_at)$/;

const singularOf = (name: string) => name.replace(/s$/, "");

/** The status-history table's columns, from names and keys */
export function inferStatusHistoryColumns(
  historyTable: Table,
  entityTable: Table,
): StatusHistoryBinding {
  const fields = historyTable.fields ?? [];
  const entityFieldIds = new Set((entityTable.fields ?? []).map(idOf));
  const entityName = singularOf(entityTable.name.toLowerCase());
  const entityKey =
    fields.find(
      (field) =>
        isFK(field) &&
        field.fk_target_field_id != null &&
        entityFieldIds.has(field.fk_target_field_id),
    ) ?? fields.find((field) => nameOf(field) === `${entityName}_id`);
  const state =
    getStatusFields(fields)[0] ??
    fields.find((field) =>
      /(^|_)(status|stage|state)(_id|_name)?$/.test(nameOf(field)),
    );
  const changedAt =
    fields.find(
      (field) => isDate(field) && CHANGED_AT_RE.test(nameOf(field)),
    ) ?? fields.find((field) => isDate(field));
  return {
    tableId: historyTable.id,
    entityKeyFieldId: entityKey ? idOf(entityKey) : null,
    stateFieldId: state ? idOf(state) : null,
    changedAtFieldId: changedAt ? idOf(changedAt) : null,
  };
}

/**
 * The table's status column: the one an admin picked, none if they cleared
 * it, or else the clearest-named status column.
 */
export function resolveStatusField(
  fields: Field[],
  statusFieldId: FieldId | null | undefined,
): Field | undefined {
  if (statusFieldId === null) {
    return undefined;
  }
  if (statusFieldId !== undefined) {
    return fields.find((field) => idOf(field) === statusFieldId);
  }
  return getStatusFields(fields)[0];
}

/**
 * A `<entity>_status_history` (or stage or state) table in the same schema,
 * matched by name and, failing that, by a key back to the entity.
 */
export function inferStatusHistory(
  table: Table,
  schemaTables: Table[],
): StatusHistoryInference | null {
  const entityNames = new Set([
    table.name.toLowerCase(),
    singularOf(table.name.toLowerCase()),
  ]);
  const entityFieldIds = new Set((table.fields ?? []).map(idOf));
  const candidates = schemaTables.filter(
    (candidate) =>
      candidate.id !== table.id &&
      HISTORY_RE.test(candidate.name.toLowerCase()),
  );
  const byName = candidates.find((candidate) => {
    const prefix = HISTORY_RE.exec(candidate.name.toLowerCase())?.[1];
    return prefix != null && entityNames.has(prefix);
  });
  const byKey = candidates.find((candidate) =>
    (candidate.fields ?? []).some(
      (field) =>
        field.fk_target_field_id != null &&
        entityFieldIds.has(field.fk_target_field_id),
    ),
  );
  const historyTable = byName ?? byKey;
  if (!historyTable) {
    return null;
  }
  return {
    binding: inferStatusHistoryColumns(historyTable, table),
    signal: byName
      ? t`${historyTable.name} is named after ${table.name}`
      : t`${historyTable.name} has a key back to ${table.name}`,
  };
}

/**
 * The happy path from the order: each open state to the next, and the last
 * open state to each terminal one. Values still in Other aren't placed yet,
 * so they're left off.
 */
export function inferTypicalTransitions(
  states: OrderedValue[],
): InferredTransition[] {
  const open = states.filter(({ bucket }) => bucket === "open");
  const terminal = states.filter(({ bucket }) => isTerminalBucket(bucket));
  const steps = open.slice(1).map((state, index) => ({
    from: open[index].value,
    to: state.value,
  }));
  const last = open[open.length - 1];
  const finishes = last
    ? terminal.map((state) => ({ from: last.value, to: state.value }))
    : [];
  return [...steps, ...finishes].map((transition) => ({
    ...transition,
    kind: "typical",
    signal: t`The next step in the order`,
  }));
}

/**
 * A transition seen in the history but not on the happy path: backward, or
 * out of a terminal state, is unexpected; a skip forward is allowed.
 */
export function classifyObservedTransition(
  transition: Transition,
  states: OrderedValue[],
): InferredTransition {
  const fromIndex = states.findIndex(({ value }) => value === transition.from);
  const toIndex = states.findIndex(({ value }) => value === transition.to);
  const from = states[fromIndex];
  const isReopen = from != null && isTerminalBucket(from.bucket);
  const isBackward = fromIndex !== -1 && toIndex !== -1 && toIndex < fromIndex;
  return isReopen || isBackward
    ? {
        ...transition,
        kind: "unexpected",
        signal: isReopen
          ? t`Seen leaving a final state`
          : t`Seen going back a step`,
      }
    : {
        ...transition,
        kind: "allowed",
        signal: t`Seen in the history, skipping ahead`,
      };
}

/** How often each transition was seen, by transition key */
export type ObservedTransitions = Map<
  string,
  { transition: Transition; count: number }
>;

/** Each change of state per entity, from history rows sorted by entity and time */
export function countObservedTransitions(
  rows: { entity: string; state: string }[],
): ObservedTransitions {
  const counts: ObservedTransitions = new Map();
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    if (
      !previous ||
      previous.entity !== row.entity ||
      previous.state === row.state
    ) {
      return;
    }
    const transition = { from: previous.state, to: row.state };
    const key = getTransitionKey(transition);
    const current = counts.get(key);
    counts.set(key, { transition, count: (current?.count ?? 0) + 1 });
  });
  return counts;
}
