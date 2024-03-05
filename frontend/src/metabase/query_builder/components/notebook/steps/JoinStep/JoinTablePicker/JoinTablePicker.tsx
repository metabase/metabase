import { useMemo, useState } from "react";
import { t } from "ttag";

import { FieldPicker } from "metabase/common/components/FieldPicker";
import { DATA_BUCKET } from "metabase/containers/DataPicker";
import Tables from "metabase/entities/tables";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import { getMetadata } from "metabase/selectors/metadata";
import { Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Table from "metabase-lib/metadata/Table";
import type { TableId } from "metabase-types/api";

import { FIELDS_PICKER_STYLES } from "../../../FieldsPickerIcon";
import { NotebookCellItem } from "../../../NotebookCell";

import { PickerButton, ColumnPickerButton } from "./JoinTablePicker.styled";

interface JoinTablePickerProps {
  query: Lib.Query;
  stageIndex: number;
  getColumns: () => Lib.ColumnMetadata[];
  table?: Lib.CardMetadata | Lib.TableMetadata;
  isStartedFromModel?: boolean;
  readOnly?: boolean;
  color: string;
  isColumnSelected: (
    column: Lib.ColumnMetadata,
    columnInfo: Lib.ColumnDisplayInfo,
  ) => boolean;
  onChangeTable: (joinable: Lib.Joinable) => void;
  onToggleColumn: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  onChangeColumns: (columns: Lib.JoinFields) => void;
}

export function JoinTablePicker({
  query,
  stageIndex,
  getColumns,
  table,
  isStartedFromModel,
  readOnly = false,
  color,
  isColumnSelected,
  onChangeTable,
  onToggleColumn,
  onChangeColumns,
}: JoinTablePickerProps) {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const tableInfo = table ? Lib.displayInfo(query, stageIndex, table) : null;
  const pickerInfo = table ? Lib.pickerInfo(query, table) : null;

  const databaseId = pickerInfo?.databaseId || Lib.databaseID(query);
  const tableId = pickerInfo?.tableId || pickerInfo?.cardId;

  const canChangeTable = !readOnly && !table;

  const databases = useMemo(() => {
    const database = metadata.database(databaseId);
    return [database, metadata.savedQuestionsDatabase()].filter(Boolean);
  }, [databaseId, metadata]);

  const selectedDataBucketId = useMemo(() => {
    if (tableId) {
      return undefined;
    }
    if (isStartedFromModel) {
      return DATA_BUCKET.DATASETS;
    }
    return undefined;
  }, [tableId, isStartedFromModel]);

  const handleTableChange = async (tableId: TableId) => {
    await dispatch(Tables.actions.fetchMetadata({ id: tableId }));
    onChangeTable(Lib.tableOrCardMetadata(query, tableId));
  };

  const tableFilter = (table: Table) => !tableId || table.db_id === databaseId;

  return (
    <NotebookCellItem
      inactive={!table}
      readOnly={readOnly}
      disabled={!canChangeTable}
      color={color}
      aria-label={t`Right table`}
      right={
        table && !readOnly ? (
          <JoinTableColumnsPicker
            query={query}
            stageIndex={stageIndex}
            getColumns={getColumns}
            isColumnSelected={isColumnSelected}
            onToggle={onToggleColumn}
            onChange={onChangeColumns}
          />
        ) : null
      }
      rightContainerStyle={FIELDS_PICKER_STYLES.notebookRightItemContainer}
    >
      <DataSourceSelector
        hasTableSearch
        canChangeDatabase={false}
        isInitiallyOpen={!table}
        databases={databases}
        tableFilter={tableFilter}
        selectedDataBucketId={selectedDataBucketId}
        selectedDatabaseId={databaseId}
        selectedTableId={tableId}
        setSourceTableFn={handleTableChange}
        triggerElement={
          <PickerButton disabled={!canChangeTable}>
            {tableInfo?.displayName || t`Pick data…`}
          </PickerButton>
        }
      />
    </NotebookCellItem>
  );
}

interface JoinTableColumnsPickerProps {
  query: Lib.Query;
  stageIndex: number;
  getColumns: () => Lib.ColumnMetadata[];
  isColumnSelected: (
    column: Lib.ColumnMetadata,
    columnInfo: Lib.ColumnDisplayInfo,
  ) => boolean;
  onToggle: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  onChange: (columns: Lib.JoinFields) => void;
}

function JoinTableColumnsPicker({
  query,
  stageIndex,
  getColumns,
  isColumnSelected,
  onToggle,
  onChange,
}: JoinTableColumnsPickerProps) {
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
      <Popover.Dropdown>
        <FieldPicker
          query={query}
          stageIndex={stageIndex}
          columns={getColumns()}
          isColumnSelected={isColumnSelected}
          onToggle={onToggle}
          onSelectAll={() => onChange("all")}
          onSelectNone={() => onChange("none")}
          data-testid="join-columns-picker"
        />
      </Popover.Dropdown>
    </Popover>
  );
}
