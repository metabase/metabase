import React, { useState } from "react";
import CheckBox from "metabase/components/CheckBox";

export const component = CheckBox;
export const category = "input";

export const description = `
A standard checkbox.
`;

function CheckBoxDemo({ checked: isCheckedInitially = false, ...props } = {}) {
  const [checked, setChecked] = useState(isCheckedInitially);
  return (
    <CheckBox
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
  Default: <CheckBoxDemo />,
  Label: <CheckBoxDemo label="Confirm Stuff" />,
  Sizing: (
    <div style={rowStyle}>
      {[10, 12, 14, 16, 18, 20, 24].map(size => (
        <CheckBoxDemo key={size} checked size={size} />
      ))}
    </div>
  ),
  Colors: (
    <div style={rowStyle}>
      {["accent1", "accent2", "accent3", "accent4"].map(color => (
        <CheckBoxDemo key={color} checked checkedColor={color} />
      ))}
    </div>
  ),
};
