/* eslint-disable react/prop-types */
import React, { useState } from "react";

import StackedCheckBox from "metabase/components/StackedCheckBox";

export const component = StackedCheckBox;
export const category = "input";

export const description = `
A stacked checkbox, representing "all" items.
`;

function StackedCheckBoxDemo({
  checked: isCheckedInitially = false,
  ...props
}) {
  const [checked, setChecked] = useState(isCheckedInitially);
  return (
    <StackedCheckBox
      {...props}
      checked={checked}
      onChange={e => setChecked(e.target.checked)}
    />
  );
}

const rowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-around",
};

export const examples = {
  Default: <StackedCheckBoxDemo />,
  Label: (
    <div>
      <StackedCheckBoxDemo label="Confirm Stuff" />
      <br />
      <StackedCheckBoxDemo label={<h3>Custom element label</h3>} />
    </div>
  ),
  Disabled: (
    <div>
      <StackedCheckBoxDemo disabled />
      <br />
      <StackedCheckBoxDemo label="Confirm Stuff" disabled checked />
    </div>
  ),
  Sizing: (
    <div style={rowStyle}>
      {[10, 12, 14, 16, 18, 20, 24].map(size => (
        <StackedCheckBoxDemo key={size} checked size={size} />
      ))}
    </div>
  ),
  Colors: (
    <div style={rowStyle}>
      {["accent1", "accent2", "accent3", "accent4"].map(color => (
        <StackedCheckBoxDemo key={color} checked checkedColor={color} />
      ))}
    </div>
  ),
};
