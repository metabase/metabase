import { updateIn } from "icepick";
import _ from "underscore";

import { COLLAPSED_ROWS_SETTING } from "metabase/lib/data_grid";
import { Icon } from "metabase/ui";
import type {
  VisualizationSettings,
  PivotTableCollapsedRowsSetting,
} from "metabase-types/api";

import { RowToggleIconRoot } from "./PivotTable.styled";

interface RowToggleIconProps {
  value: number | string[];
  settings: VisualizationSettings;
  updateSettings: (settings: VisualizationSettings) => void;
  hideUnlessCollapsed?: boolean;
  rowIndex?: string[];
  "data-testid"?: string;
}

export function RowToggleIcon({
  value,
  settings,
  updateSettings,
  hideUnlessCollapsed,
  rowIndex = [],
  "data-testid": testId,
}: RowToggleIconProps) {
  if (value == null) {
    return null;
  }
  const setting = settings[
    COLLAPSED_ROWS_SETTING
  ] as PivotTableCollapsedRowsSetting;
  const ref = JSON.stringify(value);
  const isColumn = !Array.isArray(value);
  const columnRef = isColumn ? null : JSON.stringify(value.length);
  const settingValue: PivotTableCollapsedRowsSetting["value"] =
    setting.value || [];
  const isColumnCollapsed =
    !isColumn && settingValue.includes(columnRef as string);
  const isCollapsed = settingValue.includes(ref) || isColumnCollapsed;

  if (hideUnlessCollapsed && !isCollapsed) {
    // subtotal rows shouldn't have an icon unless the section is collapsed
    return null;
  }

  // The giant nested ternary below picks the right function to toggle the current button.
  // That depends on whether we're a row or column header and whether we're open or closed.
  const toggle =
    isColumn && !isCollapsed // click on open column
      ? (settingValue: PivotTableCollapsedRowsSetting["value"]) =>
          settingValue
            .filter(v => {
              const parsed = JSON.parse(v);
              return !(Array.isArray(parsed) && parsed.length === value);
            }) // remove any already collapsed items in this column
            .concat(ref) // add column to list
      : !isColumn && isColumnCollapsed // single row in collapsed column
      ? (settingValue: PivotTableCollapsedRowsSetting["value"]) =>
          settingValue
            .filter(v => v !== columnRef) // remove column from list
            .concat(
              // add other rows in this columns so they stay closed
              rowIndex
                .filter(
                  item =>
                    // equal length means they're in the same column
                    item.length === value.length &&
                    // but not exactly this item
                    !_.isEqual(item, value),
                )
                // serialize those paths
                .map(item => JSON.stringify(item)),
            )
      : isCollapsed // closed row or column
      ? (settingValue: PivotTableCollapsedRowsSetting["value"]) =>
          settingValue.filter(v => v !== ref)
      : // open row or column
        (settingValue: PivotTableCollapsedRowsSetting["value"]) =>
          settingValue.concat(ref);

  return (
    <RowToggleIconRoot
      data-testid={testId}
      onClick={e => {
        e.stopPropagation();
        updateSettings({
          [COLLAPSED_ROWS_SETTING]: updateIn(setting, ["value"], toggle),
        });
      }}
    >
      <Icon name={isCollapsed ? "add" : "dash"} size={8} />
    </RowToggleIconRoot>
  );
}
