import React from "react";

import Tooltip from "./Tooltip";

export const component = Tooltip;

export const description = `
Add context to a target element.
`;

export const examples = {
  default: (
    <Tooltip tooltip="Action">
      <a className="link">Hover on me</a>
    </Tooltip>
  ),
  longerString: (
    <Tooltip tooltip="This does an action that needs some explaining">
      <a className="link">Hover on me</a>
    </Tooltip>
  ),
};
