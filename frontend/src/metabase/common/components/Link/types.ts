import type { LinkProps as RouterLinkProps } from "react-router";

import type { TooltipProps } from "metabase/ui";

export interface LinkProps extends RouterLinkProps {
  variant?: "default" | "brand" | "brandBold";
  tooltip?: string | TooltipProps;
}
