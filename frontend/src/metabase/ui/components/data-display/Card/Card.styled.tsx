import type { MantineTheme, MantineThemeOverride } from "@mantine/core";

export const getCardOverrides = (): MantineThemeOverride["components"] => ({
  Card: {
    styles: (theme: MantineTheme) => {
      return {
        cardSection: {
          borderTopColor: theme.colors.border[0],
          borderBottomColor: theme.colors.border[0],

          "&[data-first]": {
            borderBottomColor: theme.colors.border[0],
          },
        },
      };
    },
  },
});
