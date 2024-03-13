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
      style={{
        marginInlineStart: props.ms ?? props.mld,
        marginInlineEnd: props.me ?? props.mrd,
        paddingInlineStart: props.ps ?? props.pld,
        paddingInlineEnd: props.pe ?? props.prd,
      }}
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
