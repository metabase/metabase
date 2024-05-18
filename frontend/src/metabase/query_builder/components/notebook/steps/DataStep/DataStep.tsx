import { useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import {
  DataPickerModal,
  dataPickerValueFromCard,
  dataPickerValueFromTable,
} from "metabase/common/components/DataPicker";
import { FieldPicker } from "metabase/common/components/FieldPicker";
import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId } from "metabase-types/api";

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
  const dispatch = useDispatch();
  const { stageIndex } = step;
  const question = step.question;
  const questionRef = useLatest(question);
  const metadata = question.metadata();

  const tableId = Lib.sourceTableOrCardId(query);
  const table = metadata.table(tableId);
  const tableMetadata = tableId
    ? Lib.tableOrCardMetadata(query, tableId)
    : null;

  const sourceCardId = getQuestionIdFromVirtualTableId(tableId);
  const { data: sourceCard } = useGetCardQuery(
    sourceCardId ? { id: sourceCardId } : skipToken,
  );

  const [isDataPickerOpen, setIsDataPickerOpen] = useState(!tableMetadata);

  const pickerLabel = tableMetadata
    ? Lib.displayInfo(query, stageIndex, tableMetadata).displayName
    : t`Pick your starting data`;

  const isRaw = useMemo(() => {
    return (
      Lib.aggregations(query, stageIndex).length === 0 &&
      Lib.breakouts(query, stageIndex).length === 0
    );
  }, [query, stageIndex]);

  const canSelectTableColumns = tableMetadata && isRaw && !readOnly;

  const handleTableChange = async (tableId: TableId) => {
    // we need to populate question metadata with selected table
    await dispatch(Tables.actions.fetchMetadata({ id: tableId }));

    if (typeof tableId === "string") {
      await dispatch(
        Questions.actions.fetch({
          id: getQuestionIdFromVirtualTableId(tableId),
        }),
      );
    }

    // using questionRef because question is most likely stale by now
    const metadata = questionRef.current.metadata();
    const table = checkNotNull(metadata.table(tableId));
    const metadataProvider = Lib.metadataProvider(table.db_id, metadata);
    const nextTable = Lib.tableOrCardMetadata(metadataProvider, tableId);
    updateQuery(Lib.queryFromTableOrCardMetadata(metadataProvider, nextTable));
  };

  const value = useMemo(() => {
    if (sourceCardId && sourceCard) {
      return dataPickerValueFromCard(sourceCard);
    }

    return dataPickerValueFromTable(table);
  }, [sourceCard, sourceCardId, table]);

  return (
    <NotebookCell color={color}>
      <NotebookCellItem
        color={color}
        inactive={!tableMetadata}
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
        <DataStepCell onClick={() => setIsDataPickerOpen(true)}>
          {pickerLabel}
        </DataStepCell>

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
