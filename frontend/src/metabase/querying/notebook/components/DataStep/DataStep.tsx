import { type CSSProperties, useMemo } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";
import { ColumnPickerSidebar } from "metabase/query_builder/components/ColumnPickerSidebar/ColumnPickerSidebar";
import { Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import { useColumnPickerState } from "../../hooks/useColumnPickerState";
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

  const { openColumnPicker, closeColumnPicker, isColumnPickerOpen } = useColumnPickerState();
  const columnPickerId = `data-step-${stageIndex}`;
  const isColumnPickerOpenState = isColumnPickerOpen(columnPickerId);

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
                  onClick={() => openColumnPicker(columnPickerId)}
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

      {canSelectTableColumns && isColumnPickerOpenState && (() => {
        // Try resizable portal first, fallback to regular portal
        const resizablePortal = document.getElementById("notebook-column-picker-portal-resizable");
        const regularPortal = document.getElementById("notebook-column-picker-portal");
        const targetPortal = resizablePortal || regularPortal;

        if (!targetPortal) {
          return null;
        }

        return createPortal(
          <ColumnPickerSidebar
            isOpen={isColumnPickerOpenState}
            onClose={() => closeColumnPicker(columnPickerId)}
            query={query}
            stageIndex={stageIndex}
            columns={columns}
            title={t`Pick columns`}
            onToggle={handleToggle}
            onSelectAll={handleSelectAll}
            onSelectNone={handleSelectNone}
            data-testid="data-step-column-picker"
          />,
          targetPortal
        );
      })()}
    </>
  );
};
