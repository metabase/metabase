import React, { useCallback } from "react";
import { t } from "ttag";
import cloneDeep from "lodash.clonedeep";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";
import Button from "metabase/core/components/Button";
import { updateCardVisualizationSettings } from "metabase/query_builder/actions";
import type { Column } from "metabase-types/types/Dataset";

import { TableColumnOrderSetting } from "metabase-types/api";
import { normalizeFieldRef } from "metabase-lib/queries/utils/dataset";

interface ChartSettingHideButtonProps {
  column: Column;
  columns: Array<Column>;
  onClose?: () => void;
}

export function ChartSettingHideButton({
  column,
  columns,
  onClose,
}: ChartSettingHideButtonProps) {
  const hideColumn = useHideColumn(column, columns);

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

function useHideColumn(column: Column, columns: Array<Column>) {
  const dispatch = useDispatch();
  const visualizationSettings = useSelector(
    state => state.qb.card?.visualization_settings,
  );

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
    dispatch(updateCardVisualizationSettings(visSettingsClone));
  }, [dispatch, visualizationSettings, column, columns]);
}

export function getDefaultTableColumns(columns: Array<Column>) {
  return columns.map(({ name, field_ref, visibility_type }) => ({
    name,
    fieldRef: field_ref,
    enabled: visibility_type === "normal" || visibility_type === undefined,
  })) as Array<TableColumnOrderSetting>;
}

function findTableColumnIndex(
  tableColumns: Array<TableColumnOrderSetting>,
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
