import type { MantineThemeOverride } from "@mantine/core";
// import type { SyntheticEvent } from "react";

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
      // onMouseDownCapture: (_event: SyntheticEvent) => {
      // prevent nested popovers from closing each other
      // see useClickOutside in @mantine/hooks for the reference
      // TODO: follow up on fixing this -- it's probably important
      // event.nativeEvent.stopImmediatePropagation();
      // },
    },
  },
});
