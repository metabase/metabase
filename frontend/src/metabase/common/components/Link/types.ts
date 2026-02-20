import type { LinkProps as RouterLinkProps } from "react-router-dom";

import type { TooltipProps } from "metabase/ui";

import type { LinkToWithQuery } from "./utils";

export interface LinkProps extends Omit<RouterLinkProps, "to"> {
  to: LinkToWithQuery;
  disabled?: boolean;
  variant?: "default" | "brand" | "brandBold";
  tooltip?: string | TooltipProps;
}
