import cx from "classnames";
import type React from "react";
import { memo, useMemo } from "react";

import type { CellAlign } from "metabase/data-grid/types";
import { isDark } from "metabase/lib/colors/palette";

import styles from "./BaseCell.module.css";

export type BaseCellProps = {
  align?: CellAlign;
  children?: React.ReactNode;
  className?: string;
  isSelected?: boolean;
  backgroundColor?: string;
  hasHover?: boolean;
} & React.HTMLProps<HTMLDivElement>;

export const BaseCell = memo(function BaseCell({
  align = "left",
  isSelected,
  backgroundColor,
  className,
  hasHover = true,
  children,
  ...rest
}: BaseCellProps) {
  const cellStyle = useMemo(() => {
    if (isSelected) {
      return {
        "--cell-bg-color": `color-mix(in srgb, var(--mb-color-brand), white 90%)`,
        "--cell-hover-bg-color": hasHover
          ? `color-mix(in srgb, var(--mb-color-brand), white 80%)`
          : undefined,
      } as React.CSSProperties;
    }
    if (!backgroundColor) {
      return {
        "--cell-hover-bg-color": hasHover
          ? `color-mix(in srgb, var(--mb-color-brand), transparent 90%)`
          : undefined,
      } as React.CSSProperties;
    }

    const isDarkColor = isDark(backgroundColor);
    const hoverColor = isDarkColor
      ? `color-mix(in srgb, ${backgroundColor} 95%, white)`
      : `color-mix(in srgb, ${backgroundColor} 97%, black)`;

    return {
      "--cell-bg-color": backgroundColor,
      "--cell-hover-bg-color": hasHover ? hoverColor : undefined,
    } as React.CSSProperties;
  }, [backgroundColor, hasHover, isSelected]);

  return (
    <div
      aria-selected={isSelected}
      className={cx(
        styles.root,
        {
          [styles.leftAligned]: align === "left",
          [styles.rightAligned]: align === "right",
          [styles.centerAligned]: align === "middle",
        },
        className,
      )}
      style={cellStyle}
      {...rest}
    >
      {children}
    </div>
  );
});
