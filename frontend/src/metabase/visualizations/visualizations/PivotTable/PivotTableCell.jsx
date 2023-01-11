/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import Ellipsified from "metabase/core/components/Ellipsified";

import { RowToggleIcon } from "./RowToggleIcon";
import { PivotTableCell } from "./PivotTable.styled";

import { LEFT_HEADER_LEFT_SPACING } from "./constants";

export function Cell({
  value,
  style,
  icon,
  backgroundColor,
  isBody = false,
  isBold,
  isEmphasized,
  isNightMode,
  isBorderedHeader,
  isTransparent,
  hasTopBorder,
  onClick,
}) {
  return (
    <PivotTableCell
      data-testid="pivot-table-cell"
      isNightMode={isNightMode}
      isBold={isBold}
      isEmphasized={isEmphasized}
      isBorderedHeader={isBorderedHeader}
      hasTopBorder={hasTopBorder}
      isTransparent={isTransparent}
      style={{
        ...style,
        ...(backgroundColor
          ? {
              backgroundColor,
            }
          : {}),
      }}
      onClick={onClick}
    >
      <div className={cx("px1 flex align-center", { "justify-end": isBody })}>
        <Ellipsified>{value}</Ellipsified>
        {icon && <div className="pl1">{icon}</div>}
      </div>
    </PivotTableCell>
  );
}

export const TopHeaderCell = ({
  style,
  item,
  getCellClickHandler,
  isNightMode,
}) => {
  const { value, hasChildren, clicked, isSubtotal, maxDepthBelow } = item;

  return (
    <Cell
      style={{
        ...style,
      }}
      value={value}
      isNightMode={isNightMode}
      isBorderedHeader={maxDepthBelow === 0}
      isEmphasized={hasChildren}
      isBold={isSubtotal}
      onClick={getCellClickHandler(clicked)}
    />
  );
};

export const LeftHeaderCell = ({
  item,
  style,
  isNightMode,
  rowIndex,
  settings,
  onUpdateVisualizationSettings,
  getCellClickHandler,
}) => {
  const { value, isSubtotal, hasSubtotal, depth, path, clicked } = item;

  return (
    <Cell
      style={{
        ...style,
        ...(depth === 0 ? { paddingLeft: LEFT_HEADER_LEFT_SPACING } : {}),
      }}
      isNightMode={isNightMode}
      value={value}
      isEmphasized={isSubtotal}
      isBold={isSubtotal}
      onClick={getCellClickHandler(clicked)}
      icon={
        (isSubtotal || hasSubtotal) && (
          <RowToggleIcon
            value={path}
            settings={settings}
            updateSettings={onUpdateVisualizationSettings}
            hideUnlessCollapsed={isSubtotal}
            rowIndex={rowIndex} // used to get a list of "other" paths when open one item in a collapsed column
            isNightMode={isNightMode}
          />
        )
      }
    />
  );
};

export const BodyCell = ({
  style,
  rowSection,
  isNightMode,
  getCellClickHandler,
}) => {
  return (
    <div style={style} className="flex">
      {rowSection.map(
        ({ value, isSubtotal, clicked, backgroundColor }, index) => (
          <Cell
            isNightMode={isNightMode}
            key={index}
            value={value}
            isEmphasized={isSubtotal}
            isBold={isSubtotal}
            isBody
            onClick={getCellClickHandler(clicked)}
            backgroundColor={backgroundColor}
          />
        ),
      )}
    </div>
  );
};
