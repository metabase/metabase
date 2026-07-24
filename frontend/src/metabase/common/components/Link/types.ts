import type { RouterLinkProps } from "metabase/router";
import type { TooltipProps } from "metabase/ui";

export interface LinkProps extends Omit<RouterLinkProps, "to"> {
  // A link with no destination is used as a button: it navigates through its own
  // `onClick` instead. v3's types make `to` required, but both engines handle it
  // being absent, so the app's `Link` allows it.
  to?: RouterLinkProps["to"];
  variant?: "default" | "brand" | "brandBold";
  tooltip?: string | TooltipProps;
}
