import React from "react";

import DateTime, { DATE_TIME_UNITS } from "./DateTime";

export const component = DateTime;
export const description = `
Formats date and time strings according to Metabase settings (/admin/settings/localization)
`;

export const category = "display";

const now = new Date();

export const examples = Object.fromEntries(
  DATE_TIME_UNITS.map(unit => [
    unit,
    <DateTime key={unit} value={now} unit={unit} />,
  ]),
);
