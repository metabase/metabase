/* eslint-disable react/prop-types */
import React from "react";

import { getForegroundColors } from "metabase/lib/colors";
import ColorSelector from "metabase/core/components/ColorSelector";

export default function ChartSettingColorPicker(props) {
  const { value, onChange } = props;

  return (
    <div className="flex align-center mb1">
      <ColorSelector
        value={value}
        colors={getForegroundColors()}
        onChange={onChange}
      />
      {props.title && <h4 className="ml1">{props.title}</h4>}
    </div>
  );
}
