import type { MantineThemeOverride } from "@mantine/core";

export const getPopoverOverrides = (): MantineThemeOverride["components"] => ({
  Popover: {
    defaultProps: {
      withinPortal: true,
    },
  },
});
