import cx from "classnames";
import type React from "react";
import { type MouseEventHandler, memo, useCallback } from "react";

import { ExpandButton } from "../ExpandButton";
import TableS from "../Table.module.css";
import type { BodyCellBaseProps } from "../types";

import { BaseCell } from "./BaseCell";
import S from "./BodyCell.module.css";

export interface BodyCellProps<TValue> extends BodyCellBaseProps<TValue> {
  variant?: "text" | "pill";
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
  onExpand,
  className,
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
      align={align}
      className={cx(S.root, className, {
        [S.pill]: variant === "pill",
      })}
      backgroundColor={backgroundColor}
    >
      {formattedValue != null ? (
        <div
          data-grid-cell-content
          className={cx(S.content, {
            [S.noWrap]: !wrap,
          })}
          data-testid="cell-data"
        >
          {formattedValue}
        </div>
      ) : null}

      {hasExpandButton && (
        <ExpandButton
          className={TableS.cellHoverVisible}
          onClick={handleExpandClick}
        />
      )}
    </BaseCell>
  );
}) as <TValue>(props: BodyCellProps<TValue>) => React.ReactElement;
