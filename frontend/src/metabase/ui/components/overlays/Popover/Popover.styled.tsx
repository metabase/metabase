import type { MantineThemeOverride } from "@mantine/core";
import type { SyntheticEvent } from "react";

export const DEFAULT_POPOVER_Z_INDEX = 300;

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
        background: "var(--mb-color-background)",
        borderColor: "var(--mb-color-border)",
      },
    }),
  },
  PopoverDropdown: {
    defaultProps: {
      onMouseDownCapture: (event: SyntheticEvent) => {
        // prevent nested popovers from closing each other
        // see useClickOutside in @mantine/hooks for the reference
        const target = event.target as HTMLElement;
        target.setAttribute("data-ignore-outside-clicks", "true");
      },
    },
  },
});
