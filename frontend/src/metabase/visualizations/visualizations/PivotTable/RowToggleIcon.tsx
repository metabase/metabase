/* eslint-disable @typescript-eslint/no-unsafe-assignment -- FIXME: any-typed values */
import cx from "classnames";
import { updateIn } from "icepick";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { Flex, Icon, useMantineTheme } from "metabase/ui";
import { adjustBrightness, color } from "metabase/ui/colors";
import { COLLAPSED_ROWS_SETTING } from "metabase/visualizations/lib/data_grid";
import type {
  PivotTableCollapsedRowsSetting,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

import S from "./PivotTable.module.css";

interface RowToggleIconProps {
  value: number | string[];
  settings: VisualizationSettings;
  updateSettings: (settings: VisualizationSettings) => void;
  hideUnlessCollapsed?: boolean;
  rowIndex?: RowValue[][];
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
  const theme = useMantineTheme();

  if (value == null) {
    return null;
  }
  // Unjustified type cast. FIXME
  const setting = settings[
    COLLAPSED_ROWS_SETTING
  ] as PivotTableCollapsedRowsSetting;
  const ref = JSON.stringify(value);
  const isColumn = !Array.isArray(value);
  const columnRef = isColumn ? null : JSON.stringify(value.length);
  const settingValue: PivotTableCollapsedRowsSetting["value"] =
    setting.value || [];
  const isColumnCollapsed =
    // Unjustified type cast. FIXME
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
            .filter((v) => {
              const parsed = JSON.parse(v);
              return !(Array.isArray(parsed) && parsed.length === value);
            }) // remove any already collapsed items in this column
            .concat(ref) // add column to list
      : !isColumn && isColumnCollapsed // single row in collapsed column
        ? (settingValue: PivotTableCollapsedRowsSetting["value"]) =>
            settingValue
              .filter((v) => v !== columnRef) // remove column from list
              .concat(
                // add other rows in this columns so they stay closed
                rowIndex
                  .filter(
                    (item) =>
                      // equal length means they're in the same column
                      item.length === value.length &&
                      // but not exactly this item
                      !_.isEqual(item, value),
                  )
                  // serialize those paths
                  .map((item) => JSON.stringify(item)),
              )
        : isCollapsed // closed row or column
          ? (settingValue: PivotTableCollapsedRowsSetting["value"]) =>
              settingValue.filter((v) => v !== ref)
          : // open row or column
            (settingValue: PivotTableCollapsedRowsSetting["value"]) =>
              settingValue.concat(ref);

  const { textColor, backgroundColor } = theme.other.pivotTable.rowToggle;
  const hoverColor = adjustBrightness(backgroundColor, 0.2, 0.2);

  return (
    <Flex
      className={cx(S.rowToggle, CS.cursorPointer)}
      align="center"
      p="xxs"
      style={
        // custom properties, which CSSProperties does not type
        {
          "--pivot-row-toggle-color": color(textColor),
          "--pivot-row-toggle-bg": color(backgroundColor),
          "--pivot-row-toggle-hover-bg": hoverColor,
        } as React.CSSProperties
      }
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        updateSettings({
          [COLLAPSED_ROWS_SETTING]: updateIn(setting, ["value"], toggle),
        });
      }}
    >
      <Icon name={isCollapsed ? "add" : "dash"} size={8} />
    </Flex>
  );
}
