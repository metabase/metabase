import React, { useState } from "react";
import Radio from "metabase/components/Radio";

export const component = Radio;
export const category = "input";

export const description = `
A standard radio button group.
`;

const OPTIONS = [{ name: "Gadget", value: 0 }, { name: "Gizmo", value: 1 }];

function RadioDemo(props) {
  const [value, setValue] = useState(0);
  return (
    <Radio
      {...props}
      options={OPTIONS}
      value={value}
      onChange={nextValue => setValue(nextValue)}
    />
  );
}

export const examples = {
  default: <RadioDemo />,
  underlined: <RadioDemo variant="underlined" />,
  "show buttons": <RadioDemo showButtons />,
  vertical: <RadioDemo vertical />,
  bubble: <RadioDemo variant="bubble" />,
};
