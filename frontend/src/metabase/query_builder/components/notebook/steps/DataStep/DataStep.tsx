import { useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  DataPickerModal,
  getDataPickerValue,
} from "metabase/common/components/DataPicker";
import { FieldPicker } from "metabase/common/components/FieldPicker";
import { useDispatch } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { loadMetadataForTable } from "metabase/questions/actions";
import { Group, Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TableId } from "metabase-types/api";

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
  const dispatch = useDispatch();
  const { stageIndex } = step;
  const question = step.question;
  const questionRef = useLatest(question);
  const tableId = Lib.sourceTableOrCardId(query);
  const table = tableId ? Lib.tableOrCardMetadata(query, tableId) : null;
  const tableInfo = table ? Lib.displayInfo(query, stageIndex, table) : null;
  const [isDataPickerOpen, setIsDataPickerOpen] = useState(!table);

  const isRaw = useMemo(() => {
    return (
      Lib.aggregations(query, stageIndex).length === 0 &&
      Lib.breakouts(query, stageIndex).length === 0
    );
  }, [query, stageIndex]);

  const canSelectTableColumns = table && isRaw && !readOnly;

  const handleTableChange = async (tableId: TableId) => {
    await dispatch(loadMetadataForTable(tableId));
    // using questionRef to access up-to-date metadata
    const metadata = questionRef.current.metadata();
    const table = checkNotNull(metadata.table(tableId));
    const metadataProvider = Lib.metadataProvider(table.db_id, metadata);
    const nextTable = Lib.tableOrCardMetadata(metadataProvider, tableId);
    updateQuery(Lib.queryFromTableOrCardMetadata(metadataProvider, nextTable));
  };

  const value = useMemo(() => {
    return table ? getDataPickerValue(query, stageIndex, table) : undefined;
  }, [query, stageIndex, table]);

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
        <Group
          p={NotebookCell.CONTAINER_PADDING}
          spacing="xs"
          onClick={() => setIsDataPickerOpen(true)}
        >
          {tableInfo?.isMetric && <Icon name="metric" />}
          {tableInfo?.displayName ?? t`Pick your starting data`}
        </Group>

        {isDataPickerOpen && (
          <DataPickerModal
            title={t`Pick your starting data`}
            value={value}
            models={["table", "card", "dataset", "metric"]}
            onChange={handleTableChange}
            onClose={() => setIsDataPickerOpen(false)}
          />
        )}
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
