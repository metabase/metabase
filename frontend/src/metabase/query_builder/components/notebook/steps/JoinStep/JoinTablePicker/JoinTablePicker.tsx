import { t } from "ttag";

import * as Lib from "metabase-lib";

import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";

import { NotebookCellItem } from "../../../NotebookCell";
import { PickerButton } from "./JoinTablePicker.styled";

interface JoinTablePickerProps {
  query: Lib.Query;
  stageIndex: number;
  table?: Lib.CardMetadata | Lib.TableMetadata;
  readOnly?: boolean;
  color: string;
  onChangeTable: (joinable: Lib.Joinable) => void;
  onChangeFields: () => void;
}

export function JoinTablePicker({
  query,
  stageIndex,
  table,
  readOnly = false,
  color,
  onChangeTable,
}: JoinTablePickerProps) {
  const tableInfo = table ? Lib.displayInfo(query, stageIndex, table) : null;
  const pickerInfo = table ? Lib.pickerInfo(query, table) : null;

  const label = tableInfo?.displayName || t`Pick a table…`;

  const handleTableChange = (tableId: number | string) =>
    onChangeTable(Lib.tableOrCardMetadata(query, tableId));

  return (
    <NotebookCellItem
      inactive={!table}
      readOnly={readOnly}
      color={color}
      aria-label={t`Right table`}
    >
      <DataSourceSelector
        hasTableSearch
        canChangeDatabase={false}
        isInitiallyOpen={!table}
        selectedDatabaseId={pickerInfo?.databaseId}
        selectedTableId={pickerInfo?.tableId || pickerInfo?.cardId}
        setSourceTableFn={handleTableChange}
        triggerElement={<PickerButton>{label}</PickerButton>}
      />
    </NotebookCellItem>
  );
}
