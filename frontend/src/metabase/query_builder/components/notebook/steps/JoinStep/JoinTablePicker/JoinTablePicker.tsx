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
  joinable: Lib.Joinable | undefined;
  color: string;
  isReadOnly: boolean;
  onChange: (joinable: Lib.Joinable) => void;
}

export function JoinTablePicker({
  query,
  stageIndex,
  joinable,
  isReadOnly,
  color,
  onChange,
}: JoinTablePickerProps) {
  const databaseId = useMemo(() => {
    return Lib.databaseID(query);
  }, [query]);

  const joinableInfo = useMemo(() => {
    return joinable ? Lib.displayInfo(query, stageIndex, joinable) : null;
  }, [query, stageIndex, joinable]);

  const pickerInfo = useMemo(() => {
    return joinable ? Lib.pickerInfo(query, joinable) : null;
  }, [query, joinable]);

  const tableId = pickerInfo?.tableId ?? pickerInfo?.cardId;
  const tableFilter = (table: Table) => !tableId || table.db_id === databaseId;
  const isDisabled = joinable != null || isReadOnly;

  const handleTableChange = async (tableId: TableId) => {
    onChange(Lib.tableOrCardMetadata(query, tableId));
  };

  return (
    <NotebookCellItem
      inactive={!joinable}
      readOnly={isReadOnly}
      disabled={isDisabled}
      color={color}
      aria-label={t`Right table`}
    >
      <DataSourceSelector
        hasTableSearch
        canChangeDatabase={false}
        isInitiallyOpen={!joinable}
        tableFilter={tableFilter}
        selectedDatabaseId={databaseId}
        selectedTableId={tableId}
        setSourceTableFn={handleTableChange}
        triggerElement={
          <PickerButton disabled={isDisabled}>
            {joinableInfo?.displayName || t`Pick data…`}
          </PickerButton>
        }
      />
    </NotebookCellItem>
  );
}
