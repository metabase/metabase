import type { MantineThemeOverride } from "@mantine/core";

export const getCodeOverrides = (): MantineThemeOverride["components"] => ({
  Code: {
    styles: () => {
      return {
        root: {
          color: "var(--mb-color-text-primary)",
          backgroundColor: "var(--mb-color-background-info)",
        },
      };
    },
  },
});
