/* eslint-disable react/prop-types */
import React from "react";

import cx from "classnames";

import { Motion, spring } from "react-motion";

const SPRING_CONFIG = { stiffness: 200, damping: 26 };

const ViewSideBar = ({ left, right, width = 355, isOpen, children }) => (
  <Motion
    defaultStyle={{ opacity: 0, width: 0 }}
    style={
      isOpen
        ? { opacity: spring(1), width: spring(width, SPRING_CONFIG) }
        : { opacity: spring(0), width: spring(0, SPRING_CONFIG) }
    }
  >
    {motionStyle => (
      <div
        className={cx("scroll-y bg-white relative overflow-x-hidden", {
          "border-right": left,
          "border-left": right,
        })}
        style={motionStyle}
      >
        <div
          className="absolute top bottom"
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
