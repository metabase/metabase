import type { TooltipProps } from "metabase/ui";

import type { BaseLinkProps } from "./BaseLink";

export interface LinkProps extends Omit<BaseLinkProps, "innerRef"> {
  variant?: "default" | "brand" | "brandBold";
  tooltip?: string | TooltipProps;
}
