import { type CSSProperties, useMemo, useState } from "react";
import { t } from "ttag";

import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";
import { Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
import { ColumnPickerSidePanel } from "../ColumnPickerSidePanel";
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
}: NotebookStepProps) => {
  const { question, stageIndex } = step;
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
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
        <ColumnPickerSidePanel
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
