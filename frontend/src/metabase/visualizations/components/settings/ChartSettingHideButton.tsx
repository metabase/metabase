import React, { useCallback } from "react";
import { useDispatch } from "react-redux";
import { t } from "ttag";
import cloneDeep from "lodash.clonedeep";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import { updateCardVisualizationSettings } from "metabase/query_builder/actions";
import type { Column } from "metabase-types/types/Dataset";

import type {
  TableColumnOrderSetting,
  VisualizationSettings,
} from "metabase-types/api";
import { normalizeFieldRef } from "metabase-lib/queries/utils/dataset";

interface ChartSettingHideButtonProps {
  column: Column;
  columns: Column[];
  visualizationSettings: VisualizationSettings;
  onClose?: () => void;
}

export function ChartSettingHideButton({
  column,
  columns,
  visualizationSettings,
  onClose,
}: ChartSettingHideButtonProps) {
  const hideColumn = useHideColumn(column, columns, visualizationSettings);

  return (
    <Button
      onlyText
      icon="eye_crossed_out"
      onClick={() => {
        hideColumn();
        onClose?.();
      }}
    >
      {t`Hide this column`}
    </Button>
  );
}

function useHideColumn(
  column: Column,
  columns: Column[],
  visualizationSettings: VisualizationSettings,
) {
  const dispatch = useDispatch();

  return useCallback(() => {
    let visSettingsClone = cloneDeep(visualizationSettings);
    if (visSettingsClone === undefined) {
      visSettingsClone = {};
    }
    if (visSettingsClone["table.columns"] === undefined) {
      visSettingsClone["table.columns"] = getDefaultTableColumns(columns);
    }

    const tableColIndex = findTableColumnIndex(
      visSettingsClone?.["table.columns"],
      column,
    );
    if (tableColIndex === -1) {
      return;
    }

    const tableCol = visSettingsClone["table.columns"][tableColIndex];
    visSettingsClone["table.columns"][tableColIndex] = {
      ...tableCol,
      enabled: false,
    };
    // @ts-expect-error thunk
    dispatch(updateCardVisualizationSettings(visSettingsClone));
  }, [dispatch, visualizationSettings, column, columns]);
}

export function getDefaultTableColumns(columns: Column[]) {
  return columns.map(({ name, field_ref, visibility_type }) => ({
    name,
    fieldRef: field_ref,
    enabled: visibility_type === "normal" || visibility_type === undefined,
  })) as TableColumnOrderSetting[];
}

function findTableColumnIndex(
  tableColumns: TableColumnOrderSetting[],
  column: Column,
) {
  const fieldRef = normalizeFieldRef(column.field_ref);

  const index = tableColumns.findIndex(tableColumn =>
    _.isEqual(fieldRef, normalizeFieldRef(tableColumn.fieldRef)),
  );
  if (index !== -1) {
    return index;
  }
  return tableColumns.findIndex(
    tableColumn => column.name === tableColumn.name,
  );
}
