import type { MantineThemeOverride } from "@mantine/core";

export const getProgressOverrides = (): MantineThemeOverride["components"] => ({
  Progress: {
    styles: (theme, params) => {
      return {
        root: {
          border: `1px solid ${params.color ?? theme.fn.themeColor("brand")}`,
        },
      };
    },
    defaultProps: {
      size: 10,
    },
  },
});
