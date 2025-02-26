import cx from "classnames";
import type React from "react";
import { memo } from "react";

import type { CellAlign } from "metabase/data-grid/types";

import styles from "./BaseCell.module.css";

export type BaseCellProps = {
  align?: CellAlign;
  children?: React.ReactNode;
  className?: string;
  backgroundColor?: string;
} & React.HTMLProps<HTMLDivElement>;

export const BaseCell = memo(function BaseCell({
  align = "left",
  backgroundColor,
  className,
  children,
  ...rest
}: BaseCellProps) {
  const style = backgroundColor != null ? { backgroundColor } : undefined;

  return (
    <div
      className={cx(
        styles.root,
        {
          [styles.leftAligned]: align === "left",
          [styles.rightAligned]: align === "right",
          [styles.centerAligned]: align === "middle",
        },
        className,
      )}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
});
