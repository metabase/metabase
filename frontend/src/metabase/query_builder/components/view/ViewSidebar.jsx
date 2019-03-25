import React from "react";

import cx from "classnames";

const ViewSideBar = ({ left, right, width = 300, children }) => (
  <div
    className={cx("bg-light relative", { "border-right": left, "border-left": right })}
    style={{ width }}
  >
    <div className="spread scroll-y">{children}</div>
  </div>
);

export default ViewSideBar;
