import Tooltip from "metabase/core/components/Tooltip";

import { LinkRoot } from "./Link.styled";
import type { LinkProps } from "./types";

const Link = ({
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(Link, {
  Root: LinkRoot,
});
