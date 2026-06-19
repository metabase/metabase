import { updateIn } from "icepick";
import _ from "underscore";

import { COLLAPSED_ROWS_SETTING } from "metabase/visualizations/lib/data_grid";
import type {
  PivotTableCollapsedRowsSetting,
  VisualizationSettings,
} from "metabase-types/api";

export interface RowToggleProps {
  value: number | string[];
  settings: VisualizationSettings;
  updateSettings: (settings: VisualizationSettings) => void;
  rowIndex?: string[];
}

/** Returns whether the given row/column is currently collapsed. */
export function isRowCollapsed(
  value: number | string[],
  settings: VisualizationSettings,
): boolean {
  const setting = settings[
    COLLAPSED_ROWS_SETTING
  ] as PivotTableCollapsedRowsSetting;
  const ref = JSON.stringify(value);
  const isColumn = !Array.isArray(value);
  const columnRef = isColumn
    ? null
    : JSON.stringify((value as string[]).length);
  const settingValue: PivotTableCollapsedRowsSetting["value"] =
    setting?.value || [];
  const isColumnCollapsed =
    !isColumn && settingValue.includes(columnRef as string);
  return settingValue.includes(ref) || isColumnCollapsed;
}

/** Fires the collapse/expand toggle for a row or column header cell. */
export function toggleRow({
  value,
  settings,
  updateSettings,
  rowIndex = [],
}: RowToggleProps) {
  if (value == null) {
    return;
  }
  const setting = settings[
    COLLAPSED_ROWS_SETTING
  ] as PivotTableCollapsedRowsSetting;
  const ref = JSON.stringify(value);
  const isColumn = !Array.isArray(value);
  const columnRef = isColumn
    ? null
    : JSON.stringify((value as string[]).length);
  const settingValue: PivotTableCollapsedRowsSetting["value"] =
    setting?.value || [];
  const isColumnCollapsed =
    !isColumn && settingValue.includes(columnRef as string);
  const isCollapsed = settingValue.includes(ref) || isColumnCollapsed;

  const toggle =
    isColumn && !isCollapsed
      ? (sv: PivotTableCollapsedRowsSetting["value"]) =>
          sv
            .filter((v) => {
              const parsed = JSON.parse(v);
              return !(Array.isArray(parsed) && parsed.length === value);
            })
            .concat(ref)
      : !isColumn && isColumnCollapsed
        ? (sv: PivotTableCollapsedRowsSetting["value"]) =>
            sv
              .filter((v) => v !== columnRef)
              .concat(
                rowIndex
                  .filter(
                    (item) =>
                      item.length === (value as string[]).length &&
                      !_.isEqual(item, value),
                  )
                  .map((item) => JSON.stringify(item)),
              )
        : isCollapsed
          ? (sv: PivotTableCollapsedRowsSetting["value"]) =>
              sv.filter((v) => v !== ref)
          : (sv: PivotTableCollapsedRowsSetting["value"]) => sv.concat(ref);

  updateSettings({
    [COLLAPSED_ROWS_SETTING]: updateIn(setting, ["value"], toggle),
  });
}

interface RowToggleIconProps {
  value: number | string[];
  settings: VisualizationSettings;
  updateSettings: (settings: VisualizationSettings) => void;
  rowIndex?: string[];
  "data-testid"?: string;
}

/** Column-header toggle button (the small −/+ in the top-left corner). */
export function RowToggleIcon({
  value,
  settings,
  updateSettings,
  rowIndex = [],
  "data-testid": testId,
}: RowToggleIconProps) {
  if (value == null) {
    return null;
  }
  return (
    <span
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        toggleRow({ value, settings, updateSettings, rowIndex });
      }}
    />
  );
}
