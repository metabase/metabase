import React, { useState } from "react";
import { SegmentedControl } from "metabase/components/SegmentedControl";

export const component = SegmentedControl;
export const category = "input";

export const description = `
Radio-like segmented control input
`;

const SIMPLE_OPTIONS = [
  { name: "Gadget", value: 0 },
  { name: "Gizmo", value: 1 },
];

const OPTIONS_WITH_ICONS = [
  { name: "Gadget", value: 0, icon: "lightbulb" },
  { name: "Gizmo", value: 1, icon: "folder" },
  { name: "Doohickey", value: 2, icon: "insight" },
];

const OPTIONS_WITH_COLORS = [
  {
    name: "Gadget",
    value: 0,
    icon: "lightbulb",
    selectedColor: "accent1",
  },
  { name: "Gizmo", value: 1, icon: "folder", selectedColor: "accent2" },
  { name: "Doohickey", value: 2, icon: "insight" },
];

function SegmentedControlDemo(props) {
  const [value, setValue] = useState(0);
  return (
    <SegmentedControl
      {...props}
      value={value}
      onChange={val => setValue(val)}
    />
  );
}

export const examples = {
  default: <SegmentedControlDemo options={SIMPLE_OPTIONS} />,
  icons: <SegmentedControlDemo options={OPTIONS_WITH_ICONS} />,
  colored: <SegmentedControlDemo options={OPTIONS_WITH_COLORS} />,
};
