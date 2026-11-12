import { useCallback } from "react";

import {
  type PastValuesBinding,
  getHistoryTableCandidates,
  getReferencingFields,
  getTrackedAttributes,
  inferBindingForHistoryTable,
  inferEventDateField,
  isHistoryTableName,
  isRoleA,
  useSchemaTables,
  useTableStructures,
} from "metabase/metadata/table-structure";
import type { Field, Table } from "metabase-types/api";

const NOT_KEPT: PastValuesBinding = {
  source: "none",
  historyTableId: null,
  keyFieldId: null,
  validFromFieldId: null,
  validToFieldId: null,
};

export type DimensionReference = { table: Table; field: Field };

export type DimensionHistory = {
  tables: Table[];
  historyTable: Table | undefined;
  binding: PastValuesBinding;
  trackedFields: Field[];
  reference: DimensionReference | undefined;
  eventDateField: Field | undefined;
};

/** Whether a table holds past versions: by its History role or its name */
export function useIsHistoryTable() {
  const { getTableStructure } = useTableStructures();
  return useCallback(
    (table: Table) => {
      const { role } = getTableStructure(table);
      const hasHistoryRole =
        role != null && isRoleA(role, "role/HistoryDimension");
      return hasHistoryRole || isHistoryTableName(table);
    },
    [getTableStructure],
  );
}

/**
 * How a history table's rows line up with its dimension: the key and dates
 * set on the history table's own History tab, inferred where unset.
 */
export function useHistoryTableBinding() {
  const { getTableStructure } = useTableStructures();
  return useCallback(
    (
      dimensionTable: Table,
      historyTable: Table | undefined,
    ): PastValuesBinding => {
      if (historyTable == null) {
        return NOT_KEPT;
      }
      const inferred = inferBindingForHistoryTable(
        dimensionTable,
        historyTable,
      );
      const { history } = getTableStructure(historyTable);
      return {
        source: "history-table",
        historyTableId: historyTable.id,
        keyFieldId: history.durableKeyFieldId ?? inferred.keyFieldId,
        validFromFieldId: history.validFromFieldId ?? inferred.validFromFieldId,
        validToFieldId: history.validToFieldId ?? inferred.validToFieldId,
      };
    },
    [getTableStructure],
  );
}

/**
 * The history table that keeps a dimension's past values, the attributes it
 * tracks, and the first fact table that points at the dimension.
 */
export function useDimensionHistory(dimensionTable: Table): DimensionHistory {
  const { tables } = useSchemaTables(dimensionTable);
  const isHistoryTable = useIsHistoryTable();
  const getBinding = useHistoryTableBinding();
  const historyTable = isHistoryTable(dimensionTable)
    ? undefined
    : getHistoryTableCandidates(dimensionTable, tables, isHistoryTable).find(
        (candidate) =>
          getTrackedAttributes(dimensionTable, candidate).length > 0,
      );
  const reference = getReferencingFields(dimensionTable, tables)[0];

  return {
    tables,
    historyTable,
    binding: getBinding(dimensionTable, historyTable),
    trackedFields: getTrackedAttributes(dimensionTable, historyTable),
    reference,
    eventDateField: reference && inferEventDateField(reference.table),
  };
}
