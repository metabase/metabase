import cx from "classnames";

import type { NavLinkRenderProps } from "metabase/router";
import { Tooltip } from "metabase/ui";

import { BaseLink } from "./BaseLink";
import S from "./Link.module.css";
import type { LinkProps } from "./types";

export const Link = ({
  to,
  children,
  disabled,
  tooltip,
  variant,
  className,
  ...props
}: LinkProps): JSX.Element => {
  const styleClassName = cx(S.link, {
    [S.disabled]: disabled,
    [S.brand]: variant === "brand",
    [S.brandBold]: variant === "brandBold",
  });

  // Keep the callback form a callback: resolving it here would make every link
  // track the active route, including the ones that never style themselves by it.
  const linkClassName =
    typeof className === "function"
      ? (state: NavLinkRenderProps) => cx(styleClassName, className(state))
      : cx(styleClassName, className);

  const link = (
    <BaseLink
      {...props}
      className={linkClassName}
      to={to}
      disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      aria-disabled={disabled}
    >
      {children}
    </BaseLink>
  );

  const tooltipProps =
    typeof tooltip === "string"
      ? {
          label: tooltip,
        }
      : tooltip;

  return tooltip && tooltipProps != null ? (
    <Tooltip {...tooltipProps}>
      <span>{link}</span>
    </Tooltip>
  ) : (
    link
  );
};
