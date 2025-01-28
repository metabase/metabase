import type { MantineThemeOverride } from "@mantine/core";

export const getBadgeOverrides = (): MantineThemeOverride["components"] => ({
  Badge: {
    defaultProps: {
      variant: "light",
    },
    styles: () => {
      return {
        root: {
          backgroundColor: "var(--mb-color-brand-lighter)",
        },
      };
    },
  },
});
