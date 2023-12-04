import type { MantineThemeOverride } from "@mantine/core";

export const getPopoverOverrides = (): MantineThemeOverride["components"] => ({
  Popover: {
    defaultProps: {
      radius: "sm",
      shadow: "md",
      withinPortal: true,
    },
    styles: _theme => ({
      dropdown: {
        padding: 0,
      },
    }),
  },
});
