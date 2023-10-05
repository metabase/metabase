import { rem } from "@mantine/core";
import type { MantineThemeOverride } from "@mantine/core";

export const getTabsOverrides = (): MantineThemeOverride["components"] => ({
  Tabs: {
    styles: theme => ({
      tab: {
        color: theme.colors.text[2],
        padding: `${rem(10)} ${rem(8)}`,
        "&:hover": {
          borderColor: "transparent",
          backgroundColor: theme.colors.brand[0],
        },
        "&[data-active]": {
          color: theme.colors.brand[1],
          borderColor: theme.colors.brand[1],
        },
        "&:disabled": {
          color: theme.colors.text[0],
          opacity: 1,
        },
      },
      tabLabel: {
        fontSize: theme.fontSizes.md,
        fontWeight: "bold",
        lineHeight: theme.lineHeight,
      },
      tabIcon: {
        "&:not(:only-child)": {
          marginRight: rem(6),
        },
      },
    }),
  },
});
