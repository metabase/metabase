import { useMemo } from "react";
import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { FieldPicker } from "metabase/common/components/FieldPicker";
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";

import type { TableId } from "metabase-types/api";
import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";
import { NotebookCell, NotebookCellItem } from "../../NotebookCell";
import { FieldsPickerIcon, FIELDS_PICKER_STYLES } from "../../FieldsPickerIcon";
import { DataStepCell } from "./DataStep.styled";

export const DataStep = ({
  topLevelQuery,
  query,
  step,
  readOnly,
  color,
  updateQuery,
}: NotebookStepUiComponentProps) => {
  const { stageIndex } = step;

  const question = query.question();
  const metadata = question.metadata();
  const collectionId = question.collectionId();
  const tableId = query.sourceTableId();

  const databaseId = Lib.databaseID(topLevelQuery);
  const table = tableId
    ? Lib.tableOrCardMetadata(topLevelQuery, tableId)
    : null;

  const pickerLabel = table
    ? Lib.displayInfo(topLevelQuery, stageIndex, table).displayName
    : t`Pick your starting data`;

  const isRaw = useMemo(() => {
    return (
      Lib.aggregations(topLevelQuery, stageIndex).length === 0 &&
      Lib.breakouts(topLevelQuery, stageIndex).length === 0
    );
  }, [topLevelQuery, stageIndex]);

  const canSelectTableColumns = table && isRaw && !readOnly;

  const handleCreateQuery = (tableId: TableId) => {
    const databaseId = metadata.table(tableId)?.db_id;
    if (databaseId) {
      const nextQuery = Lib.fromLegacyQuery(databaseId, metadata, {
        type: "query",
        database: databaseId,
        query: {
          "source-table": tableId,
        },
      });
      updateQuery(nextQuery);
    }
  };

  const handleChangeTable = (nextTableId: TableId) => {
    const nextQuery = Lib.withDifferentTable(topLevelQuery, nextTableId);
    updateQuery(nextQuery);
  };

  const handleTableSelect = (tableId: TableId) => {
    const isNew = !databaseId;
    if (isNew) {
      handleCreateQuery(tableId);
    } else {
      handleChangeTable(tableId);
    }
  };

  return (
    <NotebookCell color={color}>
      <NotebookCellItem
        color={color}
        inactive={!table}
        right={
          canSelectTableColumns && (
            <DataFieldsPicker
              query={topLevelQuery}
              stageIndex={stageIndex}
              updateQuery={updateQuery}
            />
          )
        }
        containerStyle={FIELDS_PICKER_STYLES.notebookItemContainer}
        rightContainerStyle={FIELDS_PICKER_STYLES.notebookRightItemContainer}
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

interface DataFieldsPickerProps {
  query: Lib.Query;
  stageIndex: number;
  updateQuery: (query: Lib.Query) => Promise<void>;
}

export const DataFieldsPicker = ({
  query,
  stageIndex,
  updateQuery,
}: DataFieldsPickerProps) => {
  const columns = useMemo(
    () => Lib.fieldableColumns(query, stageIndex),
    [query, stageIndex],
  );

  const handleToggle = (changedIndex: number, isSelected: boolean) => {
    const nextColumns = columns.filter((_, currentIndex) => {
      if (currentIndex === changedIndex) {
        return isSelected;
      }
      const column = columns[currentIndex];
      return Lib.displayInfo(query, stageIndex, column).selected;
    });
    const nextQuery = Lib.withFields(query, stageIndex, nextColumns);
    updateQuery(nextQuery);
  };

  const checkColumnSelected = (column: Lib.ColumnMetadata) =>
    !!Lib.displayInfo(query, stageIndex, column).selected;

  const handleSelectAll = () => {
    const nextQuery = Lib.withFields(query, stageIndex, []);
    updateQuery(nextQuery);
  };

  const handleSelectNone = () => {
    const nextQuery = Lib.withFields(query, stageIndex, [columns[0]]);
    updateQuery(nextQuery);
  };

  return (
    <PopoverWithTrigger
      triggerStyle={FIELDS_PICKER_STYLES.trigger}
      triggerElement={FieldsPickerIcon}
    >
      <FieldPicker
        query={query}
        stageIndex={stageIndex}
        columns={columns}
        isColumnSelected={checkColumnSelected}
        onToggle={handleToggle}
        onSelectAll={handleSelectAll}
        onSelectNone={handleSelectNone}
      />
    </PopoverWithTrigger>
  );
};
