import { arrayMove } from "@dnd-kit/sortable";
import { type CSSProperties, useMemo, useState } from "react";
import { t } from "ttag";

import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";
import { ColumnPickerSidebar } from "metabase/query_builder/components/ColumnPickerSidebar/ColumnPickerSidebar";
import { Icon, Tooltip } from "metabase/ui";
import { updateSettings } from "metabase/visualizations/lib/settings";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
import type { FieldPickerItem } from "../FieldPicker";
import { NotebookCell, NotebookCellItem } from "../NotebookCell";
import { CONTAINER_PADDING } from "../NotebookCell/constants";
import { NotebookDataPicker } from "../NotebookDataPicker";

import S from "./DataStep.module.css";

export const DataStep = ({
  query,
  step,
  readOnly = false,
  color,
  updateQuery,
  updateVisualizationSettings,
}: NotebookStepProps) => {
  const { question, stageIndex } = step;
  const tableId = Lib.sourceTableOrCardId(query);
  const table = tableId
    ? (Lib.tableOrCardMetadata(query, tableId) ?? undefined)
    : undefined;
  const isMetric = question.type() === "metric";

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
    const newAggregations = Lib.aggregations(newQuery, stageIndex);
    if (isMetric && newAggregations.length === 0) {
      await updateQuery(Lib.aggregateByCount(newQuery, stageIndex));
    } else {
      await updateQuery(newQuery);
    }
  };
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);

  const { columns, selectedColumns } = useMemo(() => {
    const allColumns = Lib.fieldableColumns(query, stageIndex);
    const selectedFields = Lib.fields(query, stageIndex);
    const selectedFieldRefs = (
      selectedFields.length ? selectedFields : allColumns
    ).map((f) => Lib.legacyRef(query, stageIndex, f));
    const selectedColumnIndexes = Lib.findColumnIndexesFromLegacyRefs(
      query,
      stageIndex,
      allColumns,
      selectedFieldRefs,
    );

    const selectedColumns = selectedColumnIndexes.map(
      (index) => allColumns[index],
    );
    const unselectedColumns = allColumns.filter(
      (c, index) => !selectedColumnIndexes.includes(index),
    );
    const res = [...selectedColumns, ...unselectedColumns];
    return { columns: res, selectedColumns, unselectedColumns };
  }, [query, stageIndex]);

  const handleToggle = (column: Lib.ColumnMetadata, isSelected: boolean) => {
    if (isSelected) {
      const newQuery = Lib.addField(query, stageIndex, column);
      updateQuery(newQuery);
    } else {
      const newQuery = Lib.removeField(query, stageIndex, column);
      updateQuery(newQuery);
    }
  };

  const handleSelectAll = () => {
    const nextQuery = Lib.withFields(query, stageIndex, []);

    updateQuery(nextQuery);
  };

  const handleSelectNone = () => {
    const nextQuery = Lib.withFields(query, stageIndex, [columns[0]]);

    updateQuery(nextQuery);
  };

  const handleColumnDisplayNameChange = (
    column: Lib.ColumnMetadata,
    newDisplayName: string,
  ) => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    const columnKey = columnInfo.name;
    const currentSettings = question.card().visualization_settings || {};

    const diff = {
      column_settings: {
        ...currentSettings.column_settings,
        [JSON.stringify(["name", columnKey])]: {
          column_title: newDisplayName,
        },
      },
    };

    const newSettings = updateSettings(currentSettings, diff);
    const updatedQuestion = question.updateSettings(newSettings);

    updateVisualizationSettings(updatedQuestion);
  };

  const handleReorderColumns = (oldIndex: number, newIndex: number) => {
    const reorderedColumns = arrayMove(selectedColumns, oldIndex, newIndex);
    const newQuery = Lib.withFields(query, stageIndex, reorderedColumns);
    updateQuery(newQuery);
  };

  return (
    <>
      <NotebookCell color={color}>
        <NotebookCellItem
          color={color}
          inactive={!table}
          right={
            canSelectTableColumns && (
              <Tooltip label={t`Pick columns`}>
                <IconButtonWrapper
                  className={S.DataStepIconButton}
                  style={
                    {
                      "--notebook-cell-container-padding": CONTAINER_PADDING,
                    } as CSSProperties
                  }
                  aria-label={t`Pick columns`}
                  data-testid="fields-picker"
                  onClick={() => setIsColumnPickerOpen(true)}
                >
                  <Icon name="chevrondown" />
                </IconButtonWrapper>
              </Tooltip>
            )
          }
          containerStyle={{ padding: 0 }}
          rightContainerStyle={{ width: 37, padding: 0 }}
          data-testid="data-step-cell"
        >
          <NotebookDataPicker
            query={query}
            stageIndex={stageIndex}
            table={table}
            title={t`Pick your starting data`}
            canChangeDatabase
            hasMetrics
            isDisabled={readOnly}
            onChange={handleTableChange}
          />
        </NotebookCellItem>
      </NotebookCell>

      {canSelectTableColumns && (
        <ColumnPickerSidebar
          isOpen={isColumnPickerOpen}
          onClose={() => setIsColumnPickerOpen(false)}
          query={query}
          stageIndex={stageIndex}
          columns={columns}
          title={t`Pick columns`}
          isColumnSelected={isColumnSelected}
          isColumnDisabled={isColumnDisabled}
          onToggle={handleToggle}
          onSelectAll={handleSelectAll}
          onSelectNone={handleSelectNone}
          onColumnDisplayNameChange={handleColumnDisplayNameChange}
          onReorderColumns={handleReorderColumns}
          visualizationSettings={question.card().visualization_settings}
          data-testid="data-step-column-picker"
        />
      )}
    </>
  );
};

function isColumnSelected({ columnInfo }: FieldPickerItem) {
  return Boolean(columnInfo.selected);
}

function isColumnDisabled(item: FieldPickerItem, items: FieldPickerItem[]) {
  const isSelected = isColumnSelected(item);
  const isOnlySelected = items.filter(isColumnSelected).length === 1;
  return isSelected && isOnlySelected;
}
