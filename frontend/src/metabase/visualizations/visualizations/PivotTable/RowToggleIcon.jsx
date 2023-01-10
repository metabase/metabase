/* eslint-disable react/prop-types */
import React from "react";
import { updateIn } from "icepick";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import { COLLAPSED_ROWS_SETTING } from "metabase/lib/data_grid";

import { RowToggleIconRoot } from "./PivotTable.styled";

export function RowToggleIcon({
  value,
  settings,
  updateSettings,
  hideUnlessCollapsed,
  rowIndex,
  hasCustomColors,
  isNightMode,
}) {
  if (value == null) {
    return null;
  }
  const setting = settings[COLLAPSED_ROWS_SETTING];
  const ref = JSON.stringify(value);
  const isColumn = !Array.isArray(value);
  const columnRef = isColumn ? null : JSON.stringify(value.length);
  const settingValue = setting.value || [];
  const isColumnCollapsed = !isColumn && settingValue.includes(columnRef);
  const isCollapsed = settingValue.includes(ref) || isColumnCollapsed;
  if (hideUnlessCollapsed && !isCollapsed) {
    // subtotal rows shouldn't have an icon unless the section is collapsed
    return null;
  }

  // The giant nested ternary below picks the right function to toggle the current button.
  // That depends on whether we're a row or column header and whether we're open or closed.
  const toggle =
    isColumn && !isCollapsed // click on open column
      ? settingValue =>
          settingValue
            .filter(v => {
              const parsed = JSON.parse(v);
              return !(Array.isArray(parsed) && parsed.length === value);
            }) // remove any already collapsed items in this column
            .concat(ref) // add column to list
      : !isColumn && isColumnCollapsed // single row in collapsed column
      ? settingValue =>
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
      ? settingValue => settingValue.filter(v => v !== ref)
      : // open row or column
        settingValue => settingValue.concat(ref);

  return (
    <RowToggleIconRoot
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
