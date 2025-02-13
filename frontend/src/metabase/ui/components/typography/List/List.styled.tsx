import type { MantineThemeOverride } from "@mantine/core";

export const getListOverrides = (): MantineThemeOverride["components"] => ({
  List: {
    styles: () => {
      return {
        root: {
          // to revert "none" from the reset
          listStyleType: "revert",
        },
        item: {
          lineHeight: "1.5",
          color: "var(--mb-color-text-primary)",
        },
      };
    },
  },
});
