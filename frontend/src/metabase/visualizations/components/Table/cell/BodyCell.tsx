import cx from "classnames";
import type React from "react";
import {
  type HTMLAttributes,
  type MouseEventHandler,
  memo,
  useCallback,
} from "react";

import CS from "metabase/css/core/index.css";

import { ExpandButton } from "../Table.styled";
import type { CellAlign, CellFormatter } from "../types";

import { BaseCell } from "./BaseCell";
import S from "./BodyCell.module.css";

export type BodyCellProps<TValue> = {
  columnId: string;
  value: TValue;
  formatter?: CellFormatter<TValue>;
  backgroundColor?: string;
  align?: CellAlign;
  variant?: "text" | "pill";
  wrap?: boolean;
  canExpand?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onExpand?: (id: string, formattedValue: React.ReactNode) => void;
  contentAttributes?: HTMLAttributes<HTMLDivElement>;
};

export const BodyCell = memo(function BodyCell<TValue>({
  value,
  formatter,
  backgroundColor,
  align = "left",
  variant = "text",
  wrap = false,
  canExpand = false,
  contentAttributes,
  columnId,
  onClick,
  onExpand,
}: BodyCellProps<TValue>) {
  const formattedValue = formatter ? formatter(value) : String(value);

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
      className={cx(S.root, CS.hoverParent, CS.hoverVisibility, {
        [S.clickable]: !!onClick,
        [S.pill]: variant === "pill",
      })}
      backgroundColor={backgroundColor}
      role="gridcell"
    >
      {formattedValue != null ? (
        <div
          data-grid-cell-content
          className={cx(S.content, {
            [S.noWrap]: !wrap,
          })}
          {...contentAttributes}
          data-testid="cell-data"
        >
          {formattedValue}
        </div>
      ) : null}

      {hasExpandButton && (
        <ExpandButton
          className={CS.hoverChild}
          data-testid="expand-column"
          small
          borderless
          iconSize={10}
          icon="ellipsis"
          onlyIcon
          onClick={handleExpandClick}
        />
      )}
    </BaseCell>
  );
}) as <TValue>(props: BodyCellProps<TValue>) => React.ReactElement;
