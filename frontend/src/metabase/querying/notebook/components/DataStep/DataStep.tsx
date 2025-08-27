import { type CSSProperties, useMemo, useState } from "react";
import { t } from "ttag";

import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";
import { ColumnPickerSidebar } from "metabase/query_builder/components/ColumnPickerSidebar/ColumnPickerSidebar";
import { Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
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
  dataPickerOptions,
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

  const columns = useMemo(
    () => Lib.fieldableColumns(query, stageIndex),
    [query, stageIndex],
  );

  const handleToggle = (
    columnsToSelectOrDeselect: Lib.ColumnMetadata[],
    isSelected: boolean,
  ) => {
    const isSingleColumn = columnsToSelectOrDeselect.length === 1;

    let nextQuery: Lib.Query;
    if (isSingleColumn) {
      const [column] = columnsToSelectOrDeselect;
      nextQuery = isSelected
        ? Lib.addField(query, stageIndex, column)
        : Lib.removeField(query, stageIndex, column);
    } else {
      const selectedColumns = columns.filter((column) => {
        const displayInfo = Lib.displayInfo(query, stageIndex, column);

        return displayInfo.selected;
      });

      if (isSelected) {
        const uniqueSelectedColumns = [
          ...new Set([...selectedColumns, ...columnsToSelectOrDeselect]),
        ];

        nextQuery = Lib.withFields(query, stageIndex, uniqueSelectedColumns);
      } else {
        const columnsWithoutDeselected = selectedColumns.filter(
          (column) => !columnsToSelectOrDeselect.includes(column),
        );

        nextQuery = Lib.withFields(query, stageIndex, columnsWithoutDeselected);
      }
    }

    if (nextQuery) {
      updateQuery(nextQuery);
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
                  <Icon name="notebook" />
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
            {...dataPickerOptions}
          />
        </NotebookCellItem>
      </NotebookCell>

      {canSelectTableColumns && isColumnPickerOpen && (
        <ColumnPickerSidebar
          isOpen={isColumnPickerOpen}
          onClose={() => setIsColumnPickerOpen(false)}
          query={query}
          stageIndex={stageIndex}
          columns={columns}
          title={t`Pick columns`}
          onToggle={handleToggle}
          onSelectAll={handleSelectAll}
          onSelectNone={handleSelectNone}
          data-testid="data-step-column-picker"
        />
      )}
    </>
  );
};
