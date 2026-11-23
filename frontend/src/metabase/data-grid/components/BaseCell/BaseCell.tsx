import cx from "classnames";
import type React from "react";
import { memo, useMemo } from "react";

import { useDataGridTheme } from "metabase/data-grid/hooks";
import type { CellAlign } from "metabase/data-grid/types";
import { useSafeMantineTheme } from "metabase/ui";
import { getAccessibleCellColors } from "metabase/ui/colors/accessible-cell-colors";
import { tryIsDark } from "metabase/ui/colors/palette";
import { resolveColorFromCssVariable } from "metabase/ui/utils/colors";

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
  style,
  ...rest
}: BaseCellProps) {
  const getColor = useSafeMantineTheme().fn?.themeColor;
  const dataGridTheme = useDataGridTheme();
  const cellStyle = useMemo<
    React.CSSProperties & Record<`--cell-${string}`, string | undefined>
  >(() => {
    if (isSelected) {
      return {
        "--cell-bg-color": `color-mix(in srgb, var(--mb-color-core-brand), transparent 80%)`,
        "--cell-hover-bg-color": hasHover
          ? `color-mix(in srgb, var(--mb-color-core-brand), transparent 80%)`
          : undefined,
      };
    }
    if (!backgroundColor) {
      return {
        "--cell-hover-bg-color": hasHover
          ? `color-mix(in srgb, var(--mb-color-core-brand), transparent 90%)`
          : undefined,
      };
    }

    const accessibleColors = getColor
      ? getAccessibleCellColors(
          backgroundColor,
          resolveColorFromCssVariable(
            dataGridTheme?.cell?.backgroundColor ??
              getColor("background_page-primary"),
            getColor,
          ),
          resolveColorFromCssVariable(
            dataGridTheme?.cell?.textColor ?? getColor("text-primary"),
            getColor,
          ),
        )
      : undefined;

    return {
      "--cell-bg-color": accessibleColors?.backgroundColor ?? backgroundColor,
      "--cell-text-color": accessibleColors?.color,
      "--cell-hover-bg-color": hasHover
        ? (accessibleColors?.hoverBackgroundColor ??
          getHoverColor(backgroundColor))
        : undefined,
      "--cell-hover-text-color": hasHover
        ? accessibleColors?.hoverColor
        : undefined,
    };
  }, [backgroundColor, hasHover, isSelected, dataGridTheme, getColor]);

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
      style={{ ...cellStyle, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
});

function getHoverColor(backgroundColor: string) {
  const isDarkColor = tryIsDark(backgroundColor);
  if (isDarkColor == null) {
    return `color-mix(in srgb, var(--mb-color-core-brand), transparent 90%)`;
  }
  return isDarkColor
    ? `color-mix(in srgb, ${backgroundColor} 95%, white)`
    : `color-mix(in srgb, ${backgroundColor} 97%, black)`;
}
