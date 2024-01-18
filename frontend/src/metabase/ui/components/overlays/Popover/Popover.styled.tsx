import type { MantineThemeOverride } from "@mantine/core";

export const getPopoverOverrides = (): MantineThemeOverride["components"] => ({
  Popover: {
    defaultProps: {
      radius: "sm",
      shadow: "md",
      withinPortal: true,
      middlewares: { shift: true, flip: true, size: true },
    },
    styles: () => ({
      dropdown: {
        padding: 0,
        overflow: "auto",
      },
    }),
  },
});
