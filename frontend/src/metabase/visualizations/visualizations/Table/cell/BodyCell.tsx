import cx from "classnames";
import { type HTMLAttributes, memo } from "react";

import type { TableCellFormatter } from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import S from "./BodyCell.module.css";

export type BodyCellVariant = "text" | "pill" | "minibar";

export type BodyCellProps = {
  value: RowValue;
  formatter?: TableCellFormatter;
  backgroundColor?: string;
  align?: "left" | "right";
  variant?: BodyCellVariant;
  wrap?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  contentAttributes?: HTMLAttributes<HTMLDivElement>;
};

export const BodyCell = memo(function BodyCell({
  value,
  formatter,
  backgroundColor,
  align = "left",
  variant = "text",
  wrap = false,
  contentAttributes,
  onClick,
}: BodyCellProps) {
  const formattedValue = formatter ? formatter(value) : value;

  return (
    <div
      className={cx(S.root, {
        [S.clickable]: !!onClick,
        [S.alignLeft]: align === "left",
        [S.alignRight]: align === "right",
      })}
      style={{
        backgroundColor,
      }}
      onClick={onClick}
    >
      <div
        data-grid-cell-content
        className={cx(S.content, {
          [S.noWrap]: !wrap,
          [S.pill]: variant === "pill",
          [S.minibar]: variant === "minibar",
        })}
        {...contentAttributes}
      >
        {formattedValue}
      </div>
    </div>
  );
});
