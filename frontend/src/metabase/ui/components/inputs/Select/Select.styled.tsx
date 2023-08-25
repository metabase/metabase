import type { MantineThemeOverride } from "@mantine/core";

export const getSelectOverrides = (): MantineThemeOverride["components"] => ({
  Select: {
    defaultProps: {
      withinPortal: true,
    },
  },
});
