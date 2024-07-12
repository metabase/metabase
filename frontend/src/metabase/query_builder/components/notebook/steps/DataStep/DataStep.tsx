import { useMemo } from "react";
import { t } from "ttag";

import {
  FieldPicker,
  type FieldPickerItem,
} from "metabase/common/components/FieldPicker";
import { NotebookDataPicker } from "metabase/query_builder/components/notebook/NotebookDataPicker";
import { Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCell, NotebookCellItem } from "../../NotebookCell";
import type { NotebookStepUiComponentProps } from "../../types";

import { DataStepIconButton } from "./DataStep.styled";

export const DataStep = ({
  query,
  step,
  readOnly,
  color,
  updateQuery,
}: NotebookStepUiComponentProps) => {
  const { stageIndex } = step;
  const tableId = Lib.sourceTableOrCardId(query);
  const table = tableId ? Lib.tableOrCardMetadata(query, tableId) : undefined;

  const isRaw = useMemo(() => {
    return (
      Lib.aggregations(query, stageIndex).length === 0 &&
      Lib.breakouts(query, stageIndex).length === 0
    );
  }, [query, stageIndex]);

  const canSelectTableColumns = table && isRaw && !readOnly;

  const handleTableChange = async (
    table: Lib.TableMetadata | Lib.CardMetadata,
    metadataProvider: Lib.MetadataProvider,
  ) => {
    const newQuery = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
    await updateQuery(newQuery);
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
        <NotebookDataPicker
          title={t`Pick your starting data`}
          query={query}
          stageIndex={stageIndex}
          table={table}
          onChange={handleTableChange}
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
      isColumnDisabled={isColumnDisabled}
      onToggle={handleToggle}
      onSelectAll={handleSelectAll}
      onSelectNone={handleSelectNone}
    />
  );
}

function isColumnSelected({ columnInfo }: FieldPickerItem) {
  return Boolean(columnInfo.selected);
}

function isColumnDisabled(item: FieldPickerItem, items: FieldPickerItem[]) {
  const isSelected = isColumnSelected(item);
  const isOnlySelected = items.filter(isColumnSelected).length === 1;
  return isSelected && isOnlySelected;
}
