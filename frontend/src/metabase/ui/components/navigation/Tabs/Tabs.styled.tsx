import { rem } from "@mantine/core";
import type { MantineThemeOverride, TabsStylesParams } from "@mantine/core";

const TAB_PADDING = {
  horizontal: `${rem(11)} ${rem(8)}`,
  vertical: `${rem(11)} ${rem(15)} ${rem(11)} ${rem(8)}`,
};

export const getTabsOverrides = (): MantineThemeOverride["components"] => ({
  Tabs: {
    defaultProps: {
      keepMounted: false,
    },
    styles: (theme, { orientation }: TabsStylesParams) => ({
      tab: {
        color: theme.colors.text[2],
        padding: TAB_PADDING[orientation],
        "&:hover": {
          borderColor: theme.colors.bg[1],
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
      tabsList: {
        borderColor: theme.colors.bg[1],
      },
    }),
  },
});
