import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { DATA_BUCKET } from "metabase/containers/DataPicker/constants";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import { loadMetadataForTable } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Table from "metabase-lib/v1/metadata/Table";
import type { DatabaseId, TableId } from "metabase-types/api";

import { NotebookCellItem } from "../../../NotebookCell";

import {
  ColumnPickerButton,
  TablePickerButton,
} from "./JoinTablePicker.styled";

interface JoinTablePickerProps {
  query: Lib.Query;
  table: Lib.Joinable | undefined;
  tableInfo: Lib.TableDisplayInfo | undefined;
  color: string;
  isReadOnly: boolean;
  isModelDataSource: boolean;
  columnPicker: ReactNode;
  onChange?: (table: Lib.Joinable) => void;
}

export function JoinTablePicker({
  query,
  table,
  tableInfo,
  color,
  isReadOnly,
  isModelDataSource,
  columnPicker,
  onChange,
}: JoinTablePickerProps) {
  const queryRef = useLatest(query);
  const onChangeRef = useLatest(onChange);
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

  const handleTableChange = async (
    tableId: TableId,
    databaseId: DatabaseId,
  ) => {
    await dispatch(loadMetadataForTable(databaseId, tableId));
    onChangeRef.current?.(Lib.tableOrCardMetadata(queryRef.current, tableId));
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
            {tableInfo?.isMetric && <Icon name="metric" />}
            {tableInfo?.displayName ?? t`Pick data…`}
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
