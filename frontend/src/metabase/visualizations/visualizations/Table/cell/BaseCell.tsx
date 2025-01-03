import cx from "classnames";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

export type BaseCellProps = {
  textAlign?: "left" | "right";
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
};

export const BaseCell = ({
  textAlign = "left",
  className,
  style,
  children,
  onClick,
}: BaseCellProps) => {
  return (
    <div
      role="gridcell"
      className={cx(className)}
      style={{
        ...style,
        textAlign,
        cursor: onClick ? "pointer" : undefined,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
};
