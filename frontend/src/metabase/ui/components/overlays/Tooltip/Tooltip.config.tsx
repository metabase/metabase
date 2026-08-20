import {
  type MantineThemeOverride,
  Tooltip,
  getDefaultZIndex,
} from "@mantine/core";

import { PORTAL_CONTAINER_ID } from "../PortalContainer/constants";

import TooltipStyles from "./Tooltip.module.css";

const ARROW_WIDTH = 9;
const ARROW_SIZE = ARROW_WIDTH / Math.SQRT2;
const ARROW_TO_TARGET_GAP = 8;

export const tooltipOverrides: MantineThemeOverride["components"] = {
  Tooltip: Tooltip.extend({
    defaultProps: {
      // `arrowSize` is the side of the square that renders the 9px-wide arrow.
      arrowSize: ARROW_SIZE,
      offset: ARROW_TO_TARGET_GAP + (ARROW_WIDTH - ARROW_SIZE) / 2,
      radius: "md",
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
