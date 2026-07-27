import {
  Badge as MantineBadge,
  type BadgeProps as MantineBadgeProps,
} from "@mantine/core";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

import type { DerivedColorKey } from "metabase/ui/colors/types/theme";

export type BadgeColor =
  | "neutral"
  | "brand"
  | "negative"
  | "warning"
  | "positive";

export interface BadgeProps
  extends
    Omit<MantineBadgeProps, "color">,
    Omit<ComponentPropsWithoutRef<"div">, keyof MantineBadgeProps | "color"> {
  color?: BadgeColor | DerivedColorKey;
  /** Render as a small solid dot. Used as a status indicator. */
  indicator?: boolean;
}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(function Badge(
  {
    color = "neutral",
    size = "xs",
    variant = "filled",
    indicator,
    children,
    ...props
  },
  ref,
) {
  return (
    <MantineBadge
      // we're overloading `color` prop with custom values, based on which
      // proper color tokens will be used (see Badge.config.tsx)
      color={color as MantineBadgeProps["color"]}
      ref={ref}
      size={size}
      variant={variant}
      {...(indicator ? { "data-indicator": true } : {})}
      {...props}
    >
      {indicator ? null : children}
    </MantineBadge>
  );
});
