/* eslint-disable react/prop-types */

import React from "react";
import Radio from "metabase/components/Radio";

export const component = Radio;
export const category = "input";

export const description = `
A standard radio button group.
`;

const PROPS = {
  options: [{ name: "Gadget", initValue: 0 }, { name: "Gizmo", value: 1 }],
};

function RadioWrapper(props) {
  const [value, setValue] = React.useState(props.initValue);
  return <Radio {...props} value={value} onChange={setValue} />;
}

export const examples = {
  default: <RadioWrapper {...PROPS} />,
  underlined: <RadioWrapper {...PROPS} underlined />,
  "show buttons": <RadioWrapper {...PROPS} showButtons />,
  vertical: <RadioWrapper {...PROPS} vertical />,
  bubble: <RadioWrapper {...PROPS} bubble />,
};
