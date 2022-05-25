import { t } from "ttag";
import { ColorOption } from "./types";

export const getBrandColorOptions = (): ColorOption[] => [
  {
    name: "brand",
    description: t`The main color used throughout the app for buttons, links, and the default chart color.`,
  },
  {
    name: "accent1",
    description: t`The color of aggregations and breakouts in the graphical query builder.`,
  },
  {
    name: "accent7",
    description: t`Color of filters in the query builder, buttons and links in filter widgets.`,
  },
];
