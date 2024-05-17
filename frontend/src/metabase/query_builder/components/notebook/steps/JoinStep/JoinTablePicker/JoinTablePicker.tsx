import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  DataPickerModal,
  dataPickerValueFromJoinable,
} from "metabase/common/components/DataPicker";
import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import { Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
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
    // we need to populate query metadata with selected table
    await dispatch(Tables.actions.fetchMetadata({ id: tableId }));

    if (typeof tableId === "string") {
      await dispatch(
        Questions.actions.fetch({
          id: getQuestionIdFromVirtualTableId(tableId),
        }),
      );
    }

    onChangeRef.current?.(Lib.tableOrCardMetadata(queryRef.current, tableId));
  };

  const value = useMemo(() => {
    if (!joinable) {
      return undefined;
    }

    return dataPickerValueFromJoinable(query, stageIndex, joinable);
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
