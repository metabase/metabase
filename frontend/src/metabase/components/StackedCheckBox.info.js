import React from "react";
import StackedCheckBox from "metabase/components/StackedCheckBox";

export const component = StackedCheckBox;

export const description = `
A stacked checkbox, representing "all" items.
`;

export const examples = {
    "off": <StackedCheckBox />,
    "on": <StackedCheckBox checked />,
    "on inverted": <StackedCheckBox style={{ color: "#509EE3" }} invertChecked checked />
};
