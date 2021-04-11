/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import CheckBox from "metabase/components/CheckBox";

const OFFSET = 3;

const StackedCheckBox = ({ className, ...props }) => (
  <div className={cx(className, "relative")} style={{ transform: "scale(1)" }}>
    <CheckBox {...props} />
    <CheckBox
      className="absolute"
      style={{
        top: -OFFSET,
        left: OFFSET,
        zIndex: -1,
      }}
      {...props}
      noIcon
    />
  </div>
);

export default StackedCheckBox;
