import { forwardRef } from "react";

import { Badge, type BadgeProps } from "metabase/ui";

export type NavLinkBadgeProps = BadgeProps;

/**
 * A notification badge for a `NavLink`'s right section.
 */
export const NavLinkBadge = forwardRef<HTMLDivElement, NavLinkBadgeProps>(
  function NavLinkBadge(props, ref) {
    return (
      <Badge
        ref={ref}
        variant="light"
        {...props}
        styles={{
          root: {
            backgroundColor:
              "var(--navlink-badge-bg, var(--mb-color-background_surface-secondary))",
          },
          label: {
            color: "var(--navlink-badge-color, var(--mb-color-text-primary))",
          },
        }}
      />
    );
  },
);
