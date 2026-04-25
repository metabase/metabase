import { Tooltip } from "metabase/ui";

import { LinkRoot } from "./Link.styled";
import type { LinkProps } from "./types";

const LinkInner = ({
  to,
  children,
  disabled,
  tooltip,
  variant,
  ...props
}: LinkProps): JSX.Element => {
  const link = (
    <LinkRoot
      {...props}
      to={to}
      disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      aria-disabled={disabled}
      variant={variant}
    >
      {children}
    </LinkRoot>
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

export const Link = Object.assign(LinkInner, {
  Root: LinkRoot,
});
