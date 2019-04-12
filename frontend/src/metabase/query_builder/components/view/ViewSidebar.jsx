import React from "react";

import cx from "classnames";

import { Motion, spring } from "react-motion";

const ViewSideBar = ({ left, right, width = 420, isOpen, children }) => (
  <Motion
    defaultStyle={{ opacity: 0, width: 0 }}
    style={
      isOpen
        ? { opacity: spring(1), width: spring(width) }
        : { opacity: spring(0), width: spring(0) }
    }
  >
    {motionStyle => (
      <div
        className={cx("bg-light relative", {
          "border-right": left,
          "border-left": right,
        })}
        style={motionStyle}
      >
        <div className="spread scroll-y">{children}</div>
      </div>
    )}
  </Motion>
);

export default ViewSideBar;
