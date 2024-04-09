import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from "react";

import type { TooltipProps } from "metabase/core/components/Tooltip/Tooltip";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  variant?: "default" | "brand" | "brandBold";
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  tooltip?: string | TooltipProps;
  activeClassName?: string;
  activeStyle?: CSSProperties;
  onlyActiveOnIndex?: boolean;
}
