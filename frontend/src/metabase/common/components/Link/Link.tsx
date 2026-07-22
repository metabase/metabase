import cx from "classnames";

import { RouterLink } from "metabase/router/router-link";
import { Tooltip } from "metabase/ui";

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
  const link = (
    <RouterLink
      {...props}
      className={cx(
        S.link,
        {
          [S.disabled]: disabled,
          [S.brand]: variant === "brand",
          [S.brandBold]: variant === "brandBold",
        },
        className,
      )}
      to={to}
      disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      aria-disabled={disabled}
    >
      {children}
    </RouterLink>
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
