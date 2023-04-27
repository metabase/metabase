import React, { AnchorHTMLAttributes, CSSProperties, ReactNode } from "react";
import Tooltip from "metabase/core/components/Tooltip";
import { TooltipProps } from "metabase/core/components/Tooltip/Tooltip";
import { LinkRoot, variants } from "./Link.styled";

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

const Link = ({
  to,
  children,
  disabled,
  tooltip,
  variant,
  ...props
}: LinkProps): JSX.Element => {
  const StyledLink = variant ? variants[variant] : LinkRoot;

  const link = (
    <StyledLink
      {...props}
      to={to}
      disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      aria-disabled={disabled}
    >
      {children}
    </StyledLink>
  );

  const tooltipProps =
    typeof tooltip === "string"
      ? {
          tooltip,
        }
      : tooltip;

  return tooltip ? (
    <Tooltip {...tooltipProps}>
      <span>{link}</span>
    </Tooltip>
  ) : (
    link
  );
};

export default Object.assign(Link, {
  Root: LinkRoot,
});
