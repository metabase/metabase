import type { MantineThemeOverride } from "@mantine/core";
import type { SyntheticEvent } from "react";

export const getPopoverOverrides = (): MantineThemeOverride["components"] => ({
  Popover: {
    defaultProps: {
      radius: "sm",
      shadow: "md",
      withinPortal: true,
      middlewares: { shift: true, flip: true, size: true },
      transitionProps: { duration: 0 },
    },
    styles: () => ({
      dropdown: {
        padding: 0,
        overflow: "auto",
      },
    }),
  },
  PopoverDropdown: {
    defaultProps: {
      onMouseDownCapture: (event: SyntheticEvent) => {
        // HACK: prevent nested popovers from closing each other
        // see useClickOutside in @mantine/hooks for the reference
        // in react v18 (might be due to v17 changes) causes desired
        // behavoir to no longer work if we call stopImmediatePropagation
        // on the first encounter.
        if ((event as any).hasEncountedPopoverMouseDownCaptureAlready) {
          event.nativeEvent.stopImmediatePropagation();
        }

        (event as any).hasEncountedPopoverMouseDownCaptureAlready = true;
      },
    },
  },
});
