import { useMemo } from "react";
import { t } from "ttag";

import { FieldPicker } from "metabase/common/components/FieldPicker";
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import { Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatabaseId, TableId } from "metabase-types/api";

import { NotebookCell, NotebookCellItem } from "../../NotebookCell";
import type { NotebookStepUiComponentProps } from "../../types";

import { DataStepCell, DataStepIconButton } from "./DataStep.styled";

export const DataStep = ({
  query,
  step,
  readOnly,
  color,
  updateQuery,
}: NotebookStepUiComponentProps) => {
  const { stageIndex } = step;

  const question = step.question;
  const collectionId = question.collectionId();
  const databaseId = Lib.databaseID(query);
  const tableId = Lib.sourceTableOrCardId(query);
  const table = tableId ? Lib.tableOrCardMetadata(query, tableId) : null;

  const pickerLabel = table
    ? Lib.displayInfo(query, stageIndex, table).displayName
    : t`Pick your starting data`;

  const isRaw = useMemo(() => {
    return (
      Lib.aggregations(query, stageIndex).length === 0 &&
      Lib.breakouts(query, stageIndex).length === 0
    );
  }, [query, stageIndex]);

  const canSelectTableColumns = table && isRaw && !readOnly;

  const handleTableSelect = (tableId: TableId, databaseId: DatabaseId) => {
    const metadata = question.metadata();
    const metadataProvider = Lib.metadataProvider(databaseId, metadata);
    const nextTable = Lib.tableOrCardMetadata(metadataProvider, tableId);
    updateQuery(Lib.queryFromTableOrCardMetadata(metadataProvider, nextTable));
  };

  return (
    <NotebookCell color={color}>
      <NotebookCellItem
        color={color}
        inactive={!table}
        right={
          canSelectTableColumns && (
            <DataFieldPopover
              query={query}
              stageIndex={stageIndex}
              updateQuery={updateQuery}
            />
          )
        }
        containerStyle={{ padding: 0 }}
        rightContainerStyle={{ width: 37, height: 37, padding: 0 }}
        data-testid="data-step-cell"
      >
        <DataSourceSelector
          hasTableSearch
          collectionId={collectionId}
          databaseQuery={{ saved: true }}
          selectedDatabaseId={databaseId}
          selectedTableId={tableId}
          setSourceTableFn={handleTableSelect}
          isInitiallyOpen={!table}
          triggerElement={<DataStepCell>{pickerLabel}</DataStepCell>}
        />
      </NotebookCellItem>
    </NotebookCell>
  );
};

interface DataFieldPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  updateQuery: (query: Lib.Query) => Promise<void>;
}

function DataFieldPopover({
  query,
  stageIndex,
  updateQuery,
}: DataFieldPopoverProps) {
  return (
    <Popover position="bottom-start">
      <Popover.Target>
        <Tooltip label={t`Pick columns`}>
          <DataStepIconButton
            aria-label={t`Pick columns`}
            data-testid="fields-picker"
          >
            <Icon name="chevrondown" />
          </DataStepIconButton>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <DataFieldPicker
          query={query}
          stageIndex={stageIndex}
          updateQuery={updateQuery}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

interface DataFieldPickerProps {
  query: Lib.Query;
  stageIndex: number;
  updateQuery: (query: Lib.Query) => Promise<void>;
}

function DataFieldPicker({
  query,
  stageIndex,
  updateQuery,
}: DataFieldPickerProps) {
  const columns = useMemo(
    () => Lib.fieldableColumns(query, stageIndex),
    [query, stageIndex],
  );

  const handleToggle = (column: Lib.ColumnMetadata, isSelected: boolean) => {
    const nextQuery = isSelected
      ? Lib.addField(query, stageIndex, column)
      : Lib.removeField(query, stageIndex, column);
    updateQuery(nextQuery);
  };

  const isColumnSelected = (column: Lib.ColumnMetadata) => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    return Boolean(columnInfo.selected);
  };

  const handleSelectAll = () => {
    const nextQuery = Lib.withFields(query, stageIndex, []);
    updateQuery(nextQuery);
  };

  const handleSelectNone = () => {
    const nextQuery = Lib.withFields(query, stageIndex, [columns[0]]);
    updateQuery(nextQuery);
  };

  return (
    <FieldPicker
      query={query}
      stageIndex={stageIndex}
      columns={columns}
      isColumnSelected={isColumnSelected}
      onToggle={handleToggle}
      onSelectAll={handleSelectAll}
      onSelectNone={handleSelectNone}
    />
  );
}
