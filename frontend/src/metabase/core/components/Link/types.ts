import type { LinkProps as RouterLinkProps } from "react-router";

import type { TooltipProps } from "metabase/core/components/Tooltip/Tooltip";

export interface LinkProps extends RouterLinkProps {
  variant?: "default" | "brand" | "brandBold";
  tooltip?: string | TooltipProps;
}
