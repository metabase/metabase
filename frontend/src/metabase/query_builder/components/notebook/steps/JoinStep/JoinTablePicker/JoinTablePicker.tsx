import { useMemo } from "react";
import { t } from "ttag";

import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";

import { getMetadata } from "metabase/selectors/metadata";
import { useSelector } from "metabase/lib/redux";
import * as Lib from "metabase-lib";
import type Table from "metabase-lib/metadata/Table";

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
  const metadata = useSelector(getMetadata);

  const tableInfo = table ? Lib.displayInfo(query, stageIndex, table) : null;
  const pickerInfo = table ? Lib.pickerInfo(query, table) : null;

  const databaseId = pickerInfo?.databaseId || Lib.databaseID(query);
  const tableId = pickerInfo?.tableId || pickerInfo?.cardId;

  const databases = useMemo(() => {
    const database = metadata.database(databaseId);
    return [database, metadata.savedQuestionsDatabase()].filter(Boolean);
  }, [databaseId, metadata]);

  const handleTableChange = (tableId: number | string) =>
    onChangeTable(Lib.tableOrCardMetadata(query, tableId));

  const tableFilter = (table: Table) =>
    !tableId || table.db_id === pickerInfo?.tableId;

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
        databases={databases}
        tableFilter={tableFilter}
        selectedDatabaseId={databaseId}
        selectedTableId={tableId}
        setSourceTableFn={handleTableChange}
        triggerElement={
          <PickerButton>
            {tableInfo?.displayName || t`Pick a table…`}
          </PickerButton>
        }
      />
    </NotebookCellItem>
  );
}
