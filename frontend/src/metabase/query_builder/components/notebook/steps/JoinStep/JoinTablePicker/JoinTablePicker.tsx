import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import { Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Table from "metabase-lib/metadata/Table";
import type { TableId } from "metabase-types/api";

import { NotebookCellItem } from "../../../NotebookCell";

import {
  ColumnPickerButton,
  TablePickerButton,
} from "./JoinTablePicker.styled";

interface JoinTablePickerProps {
  query: Lib.Query;
  stageIndex: number;
  table: Lib.Joinable | undefined;
  color: string;
  isReadOnly: boolean;
  columnPicker: ReactNode;
  onChange?: (table: Lib.Joinable) => void;
}

export function JoinTablePicker({
  query,
  stageIndex,
  table,
  isReadOnly,
  color,
  columnPicker,
  onChange,
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
    onChange?.(Lib.tableOrCardMetadata(query, tableId));
  };

  return (
    <NotebookCellItem
      inactive={!table}
      readOnly={isReadOnly}
      disabled={isDisabled}
      color={color}
      right={
        table != null && !isReadOnly ? (
          <JoinTableColumnPicker columnPicker={columnPicker} />
        ) : null
      }
      rightContainerStyle={RIGHT_CONTAINER_STYLE}
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
          <TablePickerButton disabled={isDisabled}>
            {tableInfo?.displayName || t`Pick data…`}
          </TablePickerButton>
        }
      />
    </NotebookCellItem>
  );
}

interface JoinTableColumnPickerProps {
  columnPicker: ReactNode;
}

function JoinTableColumnPicker({ columnPicker }: JoinTableColumnPickerProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover opened={isOpened} onChange={setIsOpened}>
      <Popover.Target>
        <Tooltip label={t`Pick columns`}>
          <ColumnPickerButton
            onClick={() => setIsOpened(!isOpened)}
            aria-label={t`Pick columns`}
            data-testid="fields-picker"
          >
            <Icon name="chevrondown" />
          </ColumnPickerButton>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>{columnPicker}</Popover.Dropdown>
    </Popover>
  );
}

const RIGHT_CONTAINER_STYLE = {
  width: 37,
  height: 37,
  padding: 0,
};
