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
  className,
  children,
  disabled,
  tooltip,
  ...props
}: LinkProps): JSX.Element => {
  const link = (
    <LinkRoot to={to} className={className} {...props}>
      {children}
    </LinkRoot>
  );

  return tooltip ? <Tooltip tooltip={tooltip}>{link}</Tooltip> : link;
};

export default Object.assign(Link, {
  Root: LinkRoot,
});
