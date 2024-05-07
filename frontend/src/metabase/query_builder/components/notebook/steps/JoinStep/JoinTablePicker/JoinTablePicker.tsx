import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useGetCardQuery, useGetTableQuery } from "metabase/api";
import {
  DataPickerModal,
  dataPickerValueFromCard,
  dataPickerValueFromTable,
} from "metabase/common/components/DataPicker";
import Tables from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import { Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TableId } from "metabase-types/api";

import { NotebookCellItem } from "../../../NotebookCell";

import {
  ColumnPickerButton,
  TablePickerButton,
} from "./JoinTablePicker.styled";

interface JoinTablePickerProps {
  query: Lib.Query;
  table: Lib.Joinable | undefined;
  tableName: string | undefined;
  color: string;
  isReadOnly: boolean;
  columnPicker: ReactNode;
  onChange?: (table: Lib.Joinable) => void;
}

export function JoinTablePicker({
  query,
  table: joinable,
  tableName,
  color,
  isReadOnly,
  columnPicker,
  onChange,
}: JoinTablePickerProps) {
  const dispatch = useDispatch();
  const queryRef = useLatest(query);

  const [isDataPickerOpen, setIsDataPickerOpen] = useState(!joinable);
  const databaseId = useMemo(() => Lib.databaseID(query), [query]);

  const pickerInfo = useMemo(() => {
    return joinable ? Lib.pickerInfo(query, joinable) : null;
  }, [query, joinable]);

  const tableId = pickerInfo?.tableId ?? pickerInfo?.cardId;
  const sourceCardId = pickerInfo?.cardId;
  const { data: sourceCard } = useGetCardQuery(
    sourceCardId ? { id: sourceCardId } : skipToken,
  );

  const { data: table } = useGetTableQuery(
    tableId ? { id: tableId } : skipToken,
  );

  const isDisabled = isReadOnly;

  const handleTableChange = async (tableId: TableId) => {
    // we need to populate query metadata with selected table
    await dispatch(Tables.actions.fetchMetadata({ id: tableId }));

    // using queryRef because query is most likely stale by now
    onChange?.(Lib.tableOrCardMetadata(queryRef.current, tableId));
  };

  const value = useMemo(() => {
    if (sourceCardId && sourceCard) {
      return dataPickerValueFromCard(sourceCard);
    }

    if (table && table.id === tableId) {
      return dataPickerValueFromTable(table);
    }

    return undefined;
  }, [sourceCard, sourceCardId, table, tableId]);

  return (
    <NotebookCellItem
      inactive={!joinable}
      readOnly={isReadOnly}
      disabled={isDisabled}
      color={color}
      right={
        joinable != null && !isReadOnly ? (
          <JoinTableColumnPicker columnPicker={columnPicker} />
        ) : null
      }
      containerStyle={CONTAINER_STYLE}
      rightContainerStyle={RIGHT_CONTAINER_STYLE}
      aria-label={t`Right table`}
    >
      <TablePickerButton
        disabled={isDisabled}
        onClick={() => setIsDataPickerOpen(true)}
      >
        {tableName || t`Pick data…`}
      </TablePickerButton>

      {isDataPickerOpen && (
        <DataPickerModal
          databaseId={databaseId}
          value={value}
          onChange={handleTableChange}
          onClose={() => setIsDataPickerOpen(false)}
        />
      )}
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

const CONTAINER_STYLE = {
  padding: 0,
};

const RIGHT_CONTAINER_STYLE = {
  width: 37,
  height: 37,
  padding: 0,
};
