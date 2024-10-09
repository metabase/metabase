import { Popover, PopoverDropdown } from "@mantine/core";
import type { SyntheticEvent } from "react";

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
  PopoverDropdown: PopoverDropdown.extend({
    defaultProps: {
      onMouseDownCapture: (event: SyntheticEvent) => {
        // prevent nested popovers from closing each other
        // see useClickOutside in @mantine/hooks for the reference
        const target = event.target as HTMLElement;
        target.setAttribute("data-ignore-outside-clicks", "true");
      },
    },
  }),
};
