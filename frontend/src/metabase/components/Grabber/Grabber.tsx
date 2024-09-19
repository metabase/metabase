import cx from "classnames";
import type { PropsWithChildren } from "react";

import GrabberS from "metabase/css/components/grabber.module.css";
import CS from "metabase/css/core/index.css";

interface GrabberProps extends PropsWithChildren {
  className?: string;
  style: React.CSSProperties;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function Grabber({
  className = "",
  style,
  ...props
}: GrabberProps) {
  return (
    <div
      className={cx(GrabberS.Grabber, CS.cursorGrab, className)}
      data-testid="grabber"
      style={style}
      {...props}
    />
  );
}
