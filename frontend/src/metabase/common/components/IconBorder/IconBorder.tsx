import cx from "classnames";
import type { ReactElement } from "react";

import CS from "metabase/css/core/index.css";

interface IconBorderProps {
  borderWidth?: string | number;
  borderStyle?: string;
  borderColor?: string;
  borderRadius?: string;
  style?: React.CSSProperties;
  className?: string;
  children: ReactElement<{ size?: number | string; width?: number | string }>;
}

export function IconBorder({
  borderWidth = "1px",
  borderStyle = "solid",
  borderColor = "currentcolor",
  borderRadius = "99px",
  className,
  style = {},
  children,
}: IconBorderProps) {
  const size =
    parseInt(String(children.props.size || children.props.width), 10) * 2;
  const styles: React.CSSProperties = {
    width: size,
    height: size,
    borderWidth,
    borderStyle,
    borderColor,
    borderRadius,
    ...style,
  };

  return (
    <div className={cx(CS.flex, CS.layoutCentered, className)} style={styles}>
      {children}
    </div>
  );
}
