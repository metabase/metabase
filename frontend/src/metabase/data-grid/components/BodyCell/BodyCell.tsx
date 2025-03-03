import cx from "classnames";
import type React from "react";
import { type MouseEventHandler, memo, useCallback } from "react";

import { BaseCell } from "metabase/data-grid/components/BaseCell/BaseCell";
import DataGridS from "metabase/data-grid/components/DataGrid/DataGrid.module.css";
import type { BodyCellBaseProps } from "metabase/data-grid/types";

import { ExpandButton } from "../ExpandButton/ExpandButton";

import S from "./BodyCell.module.css";

export interface BodyCellProps<TValue> extends BodyCellBaseProps<TValue> {
  variant?: "text" | "pill";
  contentTestId?: string;
}

export const BodyCell = memo(function BodyCell<TValue>({
  value,
  formatter,
  backgroundColor,
  align = "left",
  variant = "text",
  wrap = false,
  canExpand = false,
  columnId,
  rowIndex,
  className,
  style,
  contentTestId = "cell-data",
  onExpand,
}: BodyCellProps<TValue>) {
  const formattedValue = formatter
    ? formatter(value, rowIndex, columnId)
    : String(value);

  const handleExpandClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    e => {
      e.stopPropagation();
      onExpand?.(columnId, formattedValue);
    },
    [columnId, formattedValue, onExpand],
  );

  const hasExpandButton = variant === "text" && canExpand;

  return (
    <BaseCell
      role="gridcell"
      align={align}
      className={cx(S.root, className, {
        [S.pill]: variant === "pill",
      })}
      backgroundColor={backgroundColor}
    >
      {formattedValue != null ? (
        <div
          style={style}
          data-grid-cell-content
          className={cx(S.content, {
            [S.noWrap]: !wrap,
          })}
          data-testid={contentTestId}
        >
          {formattedValue}
        </div>
      ) : null}

      {hasExpandButton && (
        <ExpandButton
          className={DataGridS.cellHoverVisible}
          onClick={handleExpandClick}
        />
      )}
    </BaseCell>
  );
}) as <TValue>(props: BodyCellProps<TValue>) => React.ReactElement;
