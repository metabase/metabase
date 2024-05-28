import type { MantineTheme, MantineThemeOverride } from "@mantine/core";

export const getCardOverrides = (): MantineThemeOverride["components"] => ({
  Card: {
    styles: (theme: MantineTheme) => {
      return {
        cardSection: {
          borderTopColor: theme.fn.themeColor("border"),
          borderBottomColor: theme.fn.themeColor("border"),

          "&[data-first]": {
            borderBottomColor: theme.fn.themeColor("border"),
          },
        },
      };
    },
  },
});
