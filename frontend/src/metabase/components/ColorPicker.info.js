import React from "react";

import ColorPicker from "./ColorPicker";

export const component = ColorPicker;
export const description = `
Allows users to pick from a set of colors. If no custom set of colors is defined, this uses the main app colors from the "normal" set.
`;

export const category = "pickers";

export const examples = {
  "": <ColorPicker onChange={() => {}} />,
  "with value": <ColorPicker value="#509ee3" onChange={() => {}} />,
};
