import React from "react";
import Button from "metabase/components/Button";

export const component = Button;

export const description = `
Metabase's main button component.
`;

export const examples = {
    "": <Button>Clickity click</Button>,
    "primary": <Button primary>Clickity click</Button>,
    "with an icon": <Button icon='star'>Clickity click</Button>
};
