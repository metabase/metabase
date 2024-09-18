/* eslint-disable react/prop-types */
import cx from "classnames";

import GrabberS from "metabase/css/components/grabber.module.css";
import CS from "metabase/css/core/index.css";
import { PropsWithChildren } from "react";

interface GrabberProps extends PropsWithChildren {
  className?: string;
  style: React.CSSProperties;
}

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
