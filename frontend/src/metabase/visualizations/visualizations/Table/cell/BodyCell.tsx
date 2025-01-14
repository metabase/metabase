import cx from "classnames";
import { type HTMLAttributes, memo } from "react";

import type { TableCellFormatter } from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import S from "./BodyCell.module.css";

export type BodyCellProps = {
  value: RowValue;
  formatter?: TableCellFormatter;
  backgroundColor?: string;
  align?: "left" | "right";
  variant?: "text" | "pill" | "minibar";
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  contentAttributes?: HTMLAttributes<HTMLDivElement>;
};

export const BodyCell = memo(function BodyCell({
  value,
  formatter,
  backgroundColor,
  align = "left",
  variant = "text",
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
