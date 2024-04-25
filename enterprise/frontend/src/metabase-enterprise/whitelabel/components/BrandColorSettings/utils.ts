import { t } from "ttag";

import type { ColorOption } from "./types";

export const getBrandColorOptions = (): ColorOption[] => [
  {
    name: "brand",
    description: t`The main color used throughout the app for buttons and links.`,
  },
  {
    name: "summarize",
    description: t`The color of aggregations and breakouts in the graphical query builder.`,
  },
  {
    name: "filter",
    description: t`Color of filters in the query builder, buttons and links in filter widgets.`,
  },
];
