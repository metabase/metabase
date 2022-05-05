import React, { CSSProperties, HTMLAttributes, ReactNode } from "react";
import Tooltip from "metabase/components/Tooltip";
import { LinkRoot } from "./Link.styled";
import { TooltipProps } from "metabase/components/Tooltip/Tooltip";

export interface LinkProps extends HTMLAttributes<HTMLAnchorElement> {
  to: string;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  tooltip?: string;
  activeClassName?: string;
  activeStyle?: CSSProperties;
  onlyActiveOnIndex?: boolean;
  TooltipProps: Omit<TooltipProps, "tooltip">;
}

const Link = ({
  to,
  children,
  disabled,
  tooltip,
  TooltipProps,
  ...props
}: LinkProps): JSX.Element => {
  const link = (
    <LinkRoot
      {...props}
      to={to}
      disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      aria-disabled={disabled}
    >
      {children}
    </LinkRoot>
  );

  return tooltip ? (
    <Tooltip tooltip={tooltip} {...TooltipProps}>
      <span>{link}</span>
    </Tooltip>
  ) : (
    link
  );
};

export default Object.assign(Link, {
  Root: LinkRoot,
});
