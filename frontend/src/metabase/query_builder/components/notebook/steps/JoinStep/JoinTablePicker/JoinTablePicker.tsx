import { useMemo } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";
import Tooltip from "metabase/core/components/Tooltip";
import { FieldPicker } from "metabase/common/components/FieldPicker";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import { DATA_BUCKET } from "metabase/containers/DataPicker";

import Tables from "metabase/entities/tables";
import { getMetadata } from "metabase/selectors/metadata";
import { useDispatch, useSelector } from "metabase/lib/redux";

import type { TableId } from "metabase-types/api";
import * as Lib from "metabase-lib";
import type Table from "metabase-lib/metadata/Table";

import { NotebookCellItem } from "../../../NotebookCell";
import { FIELDS_PICKER_STYLES } from "../../../FieldsPickerIcon";
import { PickerButton, ColumnPickerButton } from "./JoinTablePicker.styled";

interface JoinTablePickerProps {
  query: Lib.Query;
  stageIndex: number;
  columns?: Lib.ColumnMetadata[];
  table?: Lib.CardMetadata | Lib.TableMetadata;
  isStartedFromModel?: boolean;
  readOnly?: boolean;
  color: string;
  isColumnSelected: (column: Lib.ColumnMetadata) => boolean;
  onChangeTable: (joinable: Lib.Joinable) => void;
  onChangeFields: (columns: Lib.JoinFields) => void;
}

export function JoinTablePicker({
  query,
  stageIndex,
  columns = [],
  table,
  isStartedFromModel,
  readOnly = false,
  color,
  isColumnSelected,
  onChangeTable,
  onChangeFields,
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
            columns={columns}
            isColumnSelected={isColumnSelected}
            onChange={onChangeFields}
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
  columns: Lib.ColumnMetadata[];
  isColumnSelected: (column: Lib.ColumnMetadata) => boolean;
  onChange: (columns: Lib.JoinFields) => void;
}

function JoinTableColumnsPicker({
  query,
  stageIndex,
  columns,
  isColumnSelected,
  onChange,
}: JoinTableColumnsPickerProps) {
  const handleToggle = (changedIndex: number, isSelected: boolean) => {
    const nextColumns = columns.filter((_, currentIndex) =>
      currentIndex === changedIndex
        ? isSelected
        : isColumnSelected(columns[currentIndex]),
    );
    onChange(nextColumns);
  };

  const handleSelectAll = () => {
    onChange("all");
  };

  const handleSelectNone = () => {
    onChange("none");
  };

  return (
    <TippyPopoverWithTrigger
      popoverContent={
        <FieldPicker
          query={query}
          stageIndex={stageIndex}
          columns={columns}
          isColumnSelected={isColumnSelected}
          onToggle={handleToggle}
          onSelectAll={handleSelectAll}
          onSelectNone={handleSelectNone}
          data-testid="join-columns-picker"
        />
      }
      renderTrigger={({ onClick }) => (
        <div>
          <Tooltip tooltip={t`Pick columns`}>
            <ColumnPickerButton
              onClick={onClick}
              aria-label={t`Pick columns`}
              data-testid="fields-picker"
            >
              <Icon name="chevrondown" />
            </ColumnPickerButton>
          </Tooltip>
        </div>
      )}
    />
  );
}
