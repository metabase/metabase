import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  DataPickerModal,
  getDataPickerValue,
} from "metabase/common/components/DataPicker";
import { useDispatch } from "metabase/lib/redux";
import { loadMetadataForTable } from "metabase/questions/actions";
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
  stageIndex: number;
  table: Lib.Joinable | undefined;
  tableName: string | undefined;
  color: string;
  isReadOnly: boolean;
  columnPicker: ReactNode;
  onChange?: (table: Lib.Joinable) => void;
}

export function JoinTablePicker({
  query,
  stageIndex,
  table: joinable,
  tableName,
  color,
  isReadOnly,
  columnPicker,
  onChange,
}: JoinTablePickerProps) {
  const dispatch = useDispatch();
  const onChangeRef = useLatest(onChange);
  const queryRef = useLatest(query);

  const [isDataPickerOpen, setIsDataPickerOpen] = useState(!joinable);
  const databaseId = useMemo(() => Lib.databaseID(query), [query]);

  const isDisabled = isReadOnly;

  const handleTableChange = async (tableId: TableId) => {
    await dispatch(loadMetadataForTable(tableId));
    onChangeRef.current?.(Lib.tableOrCardMetadata(queryRef.current, tableId));
  };

  const value = useMemo(() => {
    return joinable
      ? getDataPickerValue(query, stageIndex, joinable)
      : undefined;
  }, [query, stageIndex, joinable]);

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
          databaseId={databaseId ?? undefined}
          title={t`Pick data to join`}
          value={value}
          models={["table", "card", "dataset"]}
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
