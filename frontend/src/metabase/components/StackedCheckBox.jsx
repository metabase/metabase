import React from "react";
import CheckBox from "metabase/components/CheckBox.jsx";

const OFFSET = 4;

const StackedCheckBox = props => (
  <div className="relative">
    <span
      className="absolute"
      style={{
        top: -OFFSET,
        left: OFFSET,
        zIndex: -1,
      }}
    >
      <CheckBox {...props} />
    </span>
    <CheckBox {...props} />
  </div>
);

export default StackedCheckBox;
