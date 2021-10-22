import React from "react";

import Toggle from "metabase/components/Toggle";

export const component = Toggle;
export const category = "input";

export const description = `
A standard toggle.
`;

export const examples = {
  off: <Toggle value={false} />,
  on: <Toggle value={true} />,
};
