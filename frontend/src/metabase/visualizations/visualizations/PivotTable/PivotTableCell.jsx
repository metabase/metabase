/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import Ellipsified from "metabase/core/components/Ellipsified";

import { PivotTableCell } from "./PivotTable.styled";

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
