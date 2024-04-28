import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { DATA_BUCKET } from "metabase/containers/DataPicker/constants";
import Tables from "metabase/entities/tables";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import { getMetadata } from "metabase/selectors/metadata";
import { Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Table from "metabase-lib/v1/metadata/Table";
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
  isModelDataSource: boolean;
  columnPicker: ReactNode;
  onChange?: (table: Lib.Joinable) => void;
}

export function JoinTablePicker({
  query,
  table,
  tableName,
  color,
  isReadOnly,
  isModelDataSource,
  columnPicker,
  onChange,
}: JoinTablePickerProps) {
  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();

  const databaseId = useMemo(() => {
    return Lib.databaseID(query);
  }, [query]);

  const databases = useMemo(() => {
    const database = metadata.database(databaseId);
    return [database, metadata.savedQuestionsDatabase()].filter(Boolean);
  }, [databaseId, metadata]);

  const pickerInfo = useMemo(() => {
    return table ? Lib.pickerInfo(query, table) : null;
  }, [query, table]);

  const tableId = pickerInfo?.tableId ?? pickerInfo?.cardId;
  const tableFilter = (table: Table) => !tableId || table.db_id === databaseId;
  const isDisabled = isReadOnly;

  const handleTableChange = async (tableId: TableId) => {
    await dispatch(Tables.actions.fetchMetadata({ id: tableId }));
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
      containerStyle={CONTAINER_STYLE}
      rightContainerStyle={RIGHT_CONTAINER_STYLE}
      aria-label={t`Right table`}
    >
      <DataSourceSelector
        hasTableSearch
        canChangeDatabase={false}
        isInitiallyOpen={!table}
        databases={databases}
        selectedDatabaseId={databaseId}
        selectedTableId={tableId}
        selectedDataBucketId={getSelectedDataBucketId(
          pickerInfo,
          isModelDataSource,
        )}
        tableFilter={tableFilter}
        setSourceTableFn={handleTableChange}
        triggerElement={
          <TablePickerButton disabled={isDisabled}>
            {tableName || t`Pick data…`}
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

const CONTAINER_STYLE = {
  padding: 0,
};

const RIGHT_CONTAINER_STYLE = {
  width: 37,
  height: 37,
  padding: 0,
};

function getSelectedDataBucketId(
  pickerInfo: Lib.PickerInfo | null,
  isModelDataSource: boolean,
) {
  if (pickerInfo?.tableId != null) {
    return undefined;
  }
  if (isModelDataSource) {
    return DATA_BUCKET.MODELS;
  }
  return undefined;
}
