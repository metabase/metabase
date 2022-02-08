import React, { CSSProperties, HTMLAttributes, ReactNode } from "react";
import Tooltip from "metabase/components/Tooltip";
import { LinkRoot } from "./Link.styled";

export interface LinkProps extends HTMLAttributes<HTMLAnchorElement> {
  to: string;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  tooltip?: string;
  activeClassName?: string;
  activeStyle?: CSSProperties;
  onlyActiveOnIndex?: boolean;
}

const Link = ({
  to,
  children,
  disabled,
  tooltip,
  ...props
}: LinkProps): JSX.Element => {
  const link = (
    <LinkRoot
      {...props}
      to={to}
      tabIndex={disabled ? -1 : undefined}
      aria-disabled={disabled}
    >
      {children}
    </LinkRoot>
  );

  return tooltip ? <Tooltip tooltip={tooltip}>{link}</Tooltip> : link;
};

export default Object.assign(Link, {
  Root: LinkRoot,
});
