import { Popover, type PopoverProps } from "@mantine/core";

import PopoverStyles from "./Popover.module.css";

export const DEFAULT_POPOVER_Z_INDEX = 300;

export const DEFAULT_POPOVER_MIDDLEWARES = {
  shift: true,
  flip: true,
  size: {
    // This fixes extra scrollbars on the body when the popover has the same width as viewport
    padding: 5,
  },
} as const satisfies PopoverProps["middlewares"];

export const popoverOverrides = {
  Popover: Popover.extend({
    defaultProps: {
      radius: "md",
      shadow: "sm_outline",
      withinPortal: true,
      hideDetached: false,
      middlewares: DEFAULT_POPOVER_MIDDLEWARES,
      transitionProps: { duration: 0 },
    },
    classNames: {
      dropdown: PopoverStyles.dropdown,
    },
  }),
};
