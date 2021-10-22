import React from "react";
import { t } from "ttag";

import Button from "metabase/components/Button";
export const component = Button;
export const category = "input";

export const description = `
Metabase's main button component.
`;

export const examples = {
  "": <Button>{t`Clickity click`}</Button>,
  primary: <Button primary>{t`Clickity click`}</Button>,
  "with an icon": <Button icon="star">{t`Clickity click`}</Button>,
};
