import React from "react";

import cx from "classnames";

const DEFAULT_STYLE = {
  borderWidth: 2,
};

const Input = ({ className, style = {}, ...props }) => (
  <input
    className={cx("input", className)}
    style={{ ...DEFAULT_STYLE, ...style }}
    {...props}
  />
);

export default Input;
