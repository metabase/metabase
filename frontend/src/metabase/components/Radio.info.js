import React from "react";
import Radio from "metabase/components/Radio";

export const component = Radio;
export const category = "input";

export const description = `
A standard radio button group.
`;

const PROPS = {
  value: 0,
  options: [{ name: "Gadget", value: 0 }, { name: "Gizmo", value: 1 }],
};

export const examples = {
  default: <Radio {...PROPS} />,
  underlined: <Radio {...PROPS} variant="underlined" />,
  "show buttons": <Radio {...PROPS} showButtons />,
  vertical: <Radio {...PROPS} vertical />,
  bubble: <Radio {...PROPS} variant="bubble" />,
};
