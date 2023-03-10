import React, {
  AnchorHTMLAttributes,
  CSSProperties,
  ReactNode,
  useState,
} from "react";
import Tooltip from "metabase/core/components/Tooltip";
import { TooltipProps } from "metabase/core/components/Tooltip/Tooltip";
import { LinkRoot } from "./Link.styled";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
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
  onFocus,
  onBlur,
  ...props
}: LinkProps): JSX.Element => {
  const [isFocused, setIsFocused] = useState(false);
  const handleFocus = (e: React.FocusEvent<HTMLAnchorElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLAnchorElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const link = (
    <LinkRoot
      {...props}
      to={to}
      disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      aria-disabled={disabled}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}
    </LinkRoot>
  );

  const tooltipProps =
    typeof tooltip === "string"
      ? {
          tooltip,
        }
      : tooltip;

  return tooltip ? (
    <Tooltip isOpen={isFocused} {...tooltipProps}>
      <span>{link}</span>
    </Tooltip>
  ) : (
    link
  );
};

export default Object.assign(Link, {
  Root: LinkRoot,
});
