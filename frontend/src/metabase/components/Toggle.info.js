/* eslint-disable react/prop-types */

import React from "react";
import Toggle from "metabase/components/Toggle";

export const component = Toggle;
export const category = "input";

export const description = `
A standard toggle.
`;

function ToggleWrapper(props) {
  const [value, setValue] = React.useState(false);
  return <Toggle {...props} value={value} onChange={setValue} />;
}

export const examples = {
  Toggle: <ToggleWrapper />,
};
