import React from "react";
import cx from "classnames";

export default function Grabber({ className, style }) {
  return <div className={cx("Grabber cursor-grab", className)} style={style} />;
}
