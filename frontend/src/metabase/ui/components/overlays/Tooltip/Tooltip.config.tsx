import {
  type MantineThemeOverride,
  Tooltip,
  getDefaultZIndex,
} from "@mantine/core";

import { PORTAL_CONTAINER_ID } from "../PortalContainer/constants";

import TooltipStyles from "./Tooltip.module.css";

export const tooltipOverrides: MantineThemeOverride["components"] = {
  Tooltip: Tooltip.extend({
    defaultProps: {
      arrowSize: 10,
      withArrow: true,
      withinPortal: true,
      // Mantine puts Tooltip, Popover and Menu on the same "popover" tier, so a
      // tooltip ties with them and loses on portal DOM order. +1 keeps it in its
      // tier but always renders above same-tier overlays.
      zIndex: getDefaultZIndex("popover") + 1,
      portalProps: {
        target: `#${PORTAL_CONTAINER_ID}`,
      },
      transitionProps: {
        transition: "fade",
        duration: 200,
      },
      events: {
        hover: true,
        focus: true,
        touch: true,
      },
      color: "tooltip-background",
    },
    classNames: {
      tooltip: TooltipStyles.tooltip,
      arrow: TooltipStyles.arrow,
    },
  }),
};
