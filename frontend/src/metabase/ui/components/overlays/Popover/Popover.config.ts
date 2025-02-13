import { Popover } from "@mantine/core";

import PopoverStyles from "./Popover.module.css";

export const DEFAULT_POPOVER_Z_INDEX = 300;

export const popoverOverrides = {
  Popover: Popover.extend({
    defaultProps: {
      radius: "sm",
      shadow: "md",
      withinPortal: true,
      middlewares: { shift: true, flip: true, size: true },
      transitionProps: { duration: 0 },
    },
    classNames: {
      dropdown: PopoverStyles.dropdown,
    },
  }),
};
