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
        className={cx("bg-white relative overflow-x-hidden", {
          "border-right": left,
          "border-left": right,
        })}
        style={motionStyle}
      >
        <div
          className="absolute top bottom scroll-y"
          style={{
            width: width,
            right: left ? 0 : undefined,
            left: right ? 0 : undefined,
          }}
        >
          {children}
        </div>
      </div>
    )}
  </Motion>
);

export default ViewSideBar;
