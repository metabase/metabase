/* eslint-disable react/prop-types */
import cx from "classnames";

export default function Grabber({ className = "", style }) {
  return <div className={cx("Grabber cursor-grab", className)} style={style} />;
}
