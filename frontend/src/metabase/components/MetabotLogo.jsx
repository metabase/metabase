import React from "react";
import cx from "classnames";

const MetabotLogo = ({ className }) => (
  <div
    style={{ width: 58, height: 40 }}
    className={cx("bg-brand rounded", className)}
  />
);

export default MetabotLogo;
