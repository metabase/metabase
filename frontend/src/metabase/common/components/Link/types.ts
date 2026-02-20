import type { ComponentProps } from "react";

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Link as RouterLink } from "metabase/routing/compat/react-router-v3";
import type { TooltipProps } from "metabase/ui";

export interface LinkProps extends ComponentProps<typeof RouterLink> {
  variant?: "default" | "brand" | "brandBold";
  tooltip?: string | TooltipProps;
}
