import type { MantineThemeOverride } from "@mantine/core";

export const getSkeletonOverrides = (): MantineThemeOverride["components"] => ({
  Skeleton: {
    styles: _theme => {
      return {
        root: {
          "&::before": {
            background: "transparent !important",
          },
          "&::after": {
            background: "var(--mb-color-border) !important",
          },
        },
      };
    },
  },
});
