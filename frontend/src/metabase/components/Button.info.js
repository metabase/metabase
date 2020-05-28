import React from "react";
import Button from "metabase/components/Button";
import { t } from "ttag";
export const component = Button;

export const description = `
Metabase's main button component.
`;

export const examples = {
  "": <Button>{t`Clickity click`}</Button>,
  primary: <Button primary>{t`Clickity click`}</Button>,
  "with an icon": <Button icon="star">{t`Clickity click`}</Button>,
};
