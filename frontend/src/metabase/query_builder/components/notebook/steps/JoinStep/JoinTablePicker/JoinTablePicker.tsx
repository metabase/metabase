import { useMemo } from "react";
import { t } from "ttag";

import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import * as Lib from "metabase-lib";
import type Table from "metabase-lib/metadata/Table";
import type { TableId } from "metabase-types/api";

import { NotebookCellItem } from "../../../NotebookCell";

import { PickerButton } from "./JoinTablePicker.styled";

interface JoinTablePickerProps {
  query: Lib.Query;
  stageIndex: number;
  table: Lib.CardMetadata | Lib.TableMetadata | undefined;
  color: string;
  isReadOnly: boolean;
  onChangeTable: (joinable: Lib.Joinable) => void;
}

export function JoinTablePicker({
  query,
  stageIndex,
  table,
  isReadOnly,
  color,
  onChangeTable,
}: JoinTablePickerProps) {
  const databaseId = useMemo(() => {
    return Lib.databaseID(query);
  }, [query]);

  const tableInfo = useMemo(() => {
    return table ? Lib.displayInfo(query, stageIndex, table) : null;
  }, [query, stageIndex, table]);

  const pickerInfo = useMemo(() => {
    return table ? Lib.pickerInfo(query, table) : null;
  }, [query, table]);

  const tableId = pickerInfo?.tableId ?? pickerInfo?.cardId;
  const tableFilter = (table: Table) => !tableId || table.db_id === databaseId;
  const isDisabled = table != null || isReadOnly;

  const handleTableChange = async (tableId: TableId) => {
    onChangeTable(Lib.tableOrCardMetadata(query, tableId));
  };

  return (
    <NotebookCellItem
      inactive={!table}
      readOnly={isReadOnly}
      disabled={isDisabled}
      color={color}
      aria-label={t`Right table`}
    >
      <DataSourceSelector
        hasTableSearch
        canChangeDatabase={false}
        isInitiallyOpen={!table}
        tableFilter={tableFilter}
        selectedDatabaseId={databaseId}
        selectedTableId={tableId}
        setSourceTableFn={handleTableChange}
        triggerElement={
          <PickerButton disabled={isDisabled}>
            {tableInfo?.displayName || t`Pick data…`}
          </PickerButton>
        }
      />
    </NotebookCellItem>
  );
}
