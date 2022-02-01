import React, {
  CSSProperties,
  forwardRef,
  HTMLAttributes,
  ReactNode,
  Ref,
} from "react";
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

const Link = forwardRef(function Link(
  { to, className, children, disabled, tooltip, ...props }: LinkProps,
  ref: Ref<HTMLAnchorElement>,
) {
  const link = (
    <LinkRoot to={to} innerRef={ref as any} className={className}>
      {children}
    </LinkRoot>
  );

  return tooltip ? <Tooltip tooltip={tooltip}>{link}</Tooltip> : link;
});

export default Object.assign(Link, {
  Root: LinkRoot,
});
