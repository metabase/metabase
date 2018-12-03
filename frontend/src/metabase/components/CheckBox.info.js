import React from "react";
import CheckBox from "metabase/components/CheckBox";

export const component = CheckBox;

export const description = `
A standard checkbox.
`;

export const examples = {
  "Default - Off": <CheckBox />,
  "On - Default blue": <CheckBox checked />,
  Purple: <CheckBox checked color="purple" />,
  Yellow: <CheckBox checked color="yellow" />,
  Red: <CheckBox checked color="red" />,
  Green: <CheckBox checked color="green" />,
};
