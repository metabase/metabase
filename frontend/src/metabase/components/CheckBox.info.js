import React from "react";
import CheckBox from "metabase/components/CheckBox";

export const component = CheckBox;

export const description = `
A standard checkbox.
`;

export const examples = {
    "off": <CheckBox />,
    "on": <CheckBox checked />,
    "on inverted": <CheckBox style={{ color: "#509EE3" }} invertChecked checked />
};
