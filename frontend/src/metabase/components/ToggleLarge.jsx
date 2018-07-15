import React from "react";

import cx from "classnames";

const ToggleLarge = ({
  style,
  className,
  value,
  onChange,
  textLeft,
  textRight,
}) => (
  <div
    className={cx(className, "bg-medium flex relative text-bold", {
      "cursor-pointer": onChange,
    })}
    style={{ borderRadius: 8, ...style }}
    onClick={() => onChange({ target: { value: !value } })}
  >
    <div
      className="absolute bg-white z1"
      style={{
        borderRadius: 6,
        top: 3,
        bottom: 3,
        width: "50%",
        [value ? "left" : "right"]: 3,
      }}
    />
    <div className="flex-full flex layout-centered z2">{textLeft}</div>
    <div className="flex-full flex layout-centered z2">{textRight}</div>
  </div>
);

export default ToggleLarge;
