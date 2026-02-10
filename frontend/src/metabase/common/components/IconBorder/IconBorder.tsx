import cx from "classnames";
import type { CSSProperties, ReactElement } from "react";

import CS from "metabase/css/core/index.css";

type IconBorderProps = {
  borderWidth?: string | number;
  borderStyle?: CSSProperties["borderStyle"];
  borderColor?: string;
  borderRadius?: string;
  style?: CSSProperties;
  className?: string;
  children: ReactElement<{ size?: number | string; width?: number | string }>;
};

export function IconBorder({
  borderWidth = "1px",
  borderStyle = "solid",
  borderColor = "currentcolor",
  borderRadius = "99px",
  style = {},
  className,
  children,
}: IconBorderProps) {
  const size =
    parseInt(String(children.props.size ?? children.props.width ?? 0), 10) * 2;

  const styles: CSSProperties = {
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
