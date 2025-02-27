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
  backgroundColor?: string;
} & React.HTMLProps<HTMLDivElement>;

export const BaseCell = memo(function BaseCell({
  align = "left",
  backgroundColor,
  className,
  children,
  ...rest
}: BaseCellProps) {
  const style = useMemo(() => {
    if (!backgroundColor) {
      return undefined;
    }

    // For dark colors, create a lighter hover for light colors, create a darker hover
    const isDarkColor = isDark(backgroundColor);
    const hoverColor = isDarkColor
      ? `color-mix(in srgb, ${backgroundColor} 95%, white)`
      : `color-mix(in srgb, ${backgroundColor} 97%, black)`;

    return {
      "--cell-bg-color": backgroundColor,
      "--cell-hover-bg-color": hoverColor,
    } as React.CSSProperties;
  }, [backgroundColor]);

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
