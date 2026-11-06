import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import {
  type InferredTransition,
  type ObservedTransitions,
  type ProcessEncoding,
  type ResolvedValueOrder,
  type StatusHistoryBinding,
  type StatusHistoryInference,
  type TableProcessOverrides,
  type TransitionKind,
  classifyObservedTransition,
  countObservedTransitions,
  getMilestoneFields,
  getProcessEncoding,
  getStatusFields,
  getTransitionKey,
  inferStatusHistory,
  inferTypicalTransitions,
  resolveStatusField,
  useLifecycle,
  useValueOrder,
} from "metabase/metadata/lifecycle";
import { useSchemaTables } from "metabase/metadata/table-structure";
import type { Field, StructuredDatasetQuery, Table } from "metabase-types/api";

// Enough history rows to see the common transitions without a heavy query
const HISTORY_ROW_LIMIT = 5000;
const MAX_TRANSITIONS = 30;

export type TransitionRow = InferredTransition & {
  key: string;
  /** Times seen in the status history; 0 without one */
  count: number;
  /** An admin's kind, else sync's */
  resolvedKind: TransitionKind;
  isOverridden: boolean;
};

/** A table's process, resolved from what an admin set over sync's inference */
export type ProcessModel = {
  fields: Field[];
  schemaTables: Table[];
  overrides: TableProcessOverrides;
  inferredStatusField: Field | undefined;
  statusField: Field | undefined;
  milestones: Field[];
  /** The status column's values in order: the process's states */
  order: ResolvedValueOrder;
  historyInference: StatusHistoryInference | null;
  history: StatusHistoryBinding | null;
  historyTable: Table | undefined;
  encoding: ProcessEncoding;
  transitions: TransitionRow[];
  /** Unexpected transitions seen in the history, most common first */
  unexpectedSeen: TransitionRow[];
};

/**
 * A process needs a status column or two milestone dates. It stays if an
 * admin cleared the status column, so they can pick one again. No queries,
 * so it's cheap enough to decide whether to show the Process tab.
 */
export function useHasProcess(table: Table): boolean {
  const { getTableProcess } = useLifecycle();
  const fields = table.fields ?? [];
  const { statusFieldId } = getTableProcess(table);
  return (
    resolveStatusField(fields, statusFieldId) != null ||
    getMilestoneFields(fields).length >= 2 ||
    statusFieldId !== undefined
  );
}

/**
 * PROTOTYPE: mocked. Everything the Process tab shows, resolved from an
 * admin's choices over sync's inference.
 */
export function useProcessModel(table: Table): ProcessModel {
  const fields = useMemo(() => table.fields ?? [], [table.fields]);
  const { tables: schemaTables } = useSchemaTables(table);
  const { getTableProcess } = useLifecycle();
  const overrides = getTableProcess(table);
  const statusField = resolveStatusField(fields, overrides.statusFieldId);
  const milestones = getMilestoneFields(fields);
  const order = useValueOrder(statusField);
  const historyInference = useMemo(
    () => inferStatusHistory(table, schemaTables),
    [table, schemaTables],
  );
  const history =
    overrides.history !== undefined
      ? overrides.history
      : (historyInference?.binding ?? null);
  const historyTable = history
    ? schemaTables.find(({ id }) => id === history.tableId)
    : undefined;
  const observed = useObservedTransitions(history, historyTable);
  const transitions =
    statusField && order.values.length > 1
      ? getTransitionRows(order, observed, overrides.transitionKinds)
      : [];

  return {
    fields,
    schemaTables,
    overrides,
    inferredStatusField: getStatusFields(fields)[0],
    statusField,
    milestones,
    order,
    historyInference,
    history,
    historyTable,
    encoding: getProcessEncoding(history != null, milestones.length),
    transitions,
    unexpectedSeen: transitions
      .filter((row) => row.resolvedKind === "unexpected" && row.count > 0)
      .sort((a, b) => b.count - a.count),
  };
}

/** The happy path from the order, then other moves seen in the history */
function getTransitionRows(
  order: ResolvedValueOrder,
  observed: ObservedTransitions,
  kindOverrides: Record<string, TransitionKind>,
): TransitionRow[] {
  const typical = inferTypicalTransitions(order.values);
  const typicalKeys = new Set(typical.map(getTransitionKey));
  return [
    ...typical,
    ...[...observed.values()]
      .filter(
        ({ transition }) => !typicalKeys.has(getTransitionKey(transition)),
      )
      .sort((a, b) => b.count - a.count)
      .map(({ transition }) =>
        classifyObservedTransition(transition, order.values),
      ),
  ]
    .slice(0, MAX_TRANSITIONS)
    .map((transition) => {
      const key = getTransitionKey(transition);
      const override = kindOverrides[key];
      return {
        ...transition,
        key,
        count: observed.get(key)?.count ?? 0,
        resolvedKind: override ?? transition.kind,
        isOverridden: override != null,
      };
    });
}

/**
 * Each status change per entity in the history table. The state values must
 * match the status column's for the counts to line up.
 */
function useObservedTransitions(
  history: StatusHistoryBinding | null,
  historyTable: Table | undefined,
): ObservedTransitions {
  const { entityKeyFieldId, stateFieldId, changedAtFieldId } = history ?? {};
  const query: StructuredDatasetQuery | null =
    historyTable &&
    entityKeyFieldId != null &&
    stateFieldId != null &&
    changedAtFieldId != null
      ? {
          database: historyTable.db_id,
          type: "query",
          query: {
            "source-table": historyTable.id,
            fields: [
              ["field", entityKeyFieldId, null],
              ["field", stateFieldId, null],
            ],
            "order-by": [
              ["asc", ["field", entityKeyFieldId, null]],
              ["asc", ["field", changedAtFieldId, null]],
            ],
            limit: HISTORY_ROW_LIMIT,
          },
        }
      : null;
  const { data } = useGetAdhocQueryQuery(query ?? skipToken);
  return useMemo(
    () =>
      countObservedTransitions(
        (data?.data.rows ?? []).map(([entity, state]) => ({
          entity: String(entity),
          state: String(state),
        })),
      ),
    [data],
  );
}
