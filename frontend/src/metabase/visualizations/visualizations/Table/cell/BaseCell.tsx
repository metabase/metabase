import cx from "classnames";
import type React from "react";
import { memo } from "react";

import styles from "./BaseCell.module.css";

export type BaseCellProps = {
  align?: "left" | "right";
  children?: React.ReactNode;
  className?: string;
};

export const BaseCell = memo(function BaseCell({
  align = "left",
  children,
  className,
}: BaseCellProps) {
  return (
    <div
      className={cx(
        styles.root,
        {
          [styles.leftAligned]: align === "left",
          [styles.rightAligned]: align === "right",
        },
        className,
      )}
    >
      {children}
    </div>
  );
});
