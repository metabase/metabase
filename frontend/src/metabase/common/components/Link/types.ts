import type { RouterLinkProps } from "metabase/router/react-router";
import type { TooltipProps } from "metabase/ui";

export interface LinkProps extends RouterLinkProps {
  variant?: "default" | "brand" | "brandBold";
  tooltip?: string | TooltipProps;
}
