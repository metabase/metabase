import { t } from "ttag";

import type { ColorOption } from "./types";

export const getBrandColorOptions = (): ColorOption[] => [
  {
    name: "brand",
    tokenName: "core-brand",
    description: t`The main color used throughout the app for buttons and links.`,
  },
  {
    name: "summarize",
    tokenName: "core-summarize",
    description: t`The color of aggregations and breakouts in the graphical query builder.`,
  },
  {
    name: "filter",
    tokenName: "core-filter",
    description: t`Color of filters in the query builder, buttons and links in filter widgets.`,
  },
];
