import { type MantineThemeOverride, Tooltip } from "@mantine/core";
import cx from "classnames";

import ZIndex from "metabase/css/core/z-index.module.css";

import TooltipStyles from "./Tooltip.module.css";

export const tooltipOverrides: MantineThemeOverride["components"] = {
  Tooltip: Tooltip.extend({
    defaultProps: {
      arrowSize: 10,
      withArrow: true,
      withinPortal: true,
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
      tooltip: cx(TooltipStyles.tooltip, ZIndex.Overlay),
      arrow: TooltipStyles.arrow,
    },
  }),
};
