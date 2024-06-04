import type { MantineThemeOverride } from "@mantine/core";

export const getProgressOverrides = (): MantineThemeOverride["components"] => ({
  Progress: {
    styles: theme => {
      return {
        root: {
          border: `1px solid ${theme.fn.themeColor("brand")}`,
        },
      };
    },
    defaultProps: {
      size: 10,
    },
  },
});
