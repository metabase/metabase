import type { MantineThemeOverride } from "@mantine/core";

export const getProgressOverrides = (): MantineThemeOverride["components"] => ({
  Progress: {
    defaultProps: {
      animate: true,
    },
  },
});
