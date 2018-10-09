import React from "react";
import StackedCheckBox from "metabase/components/StackedCheckBox";

export const component = StackedCheckBox;

export const description = `
A stacked checkbox, representing "all" items.
`;

export const examples = {
  "Off - Default": <StackedCheckBox />,
  Checked: <StackedCheckBox checked />,
  "Checked with color": <StackedCheckBox checked color="purple" />,
};
