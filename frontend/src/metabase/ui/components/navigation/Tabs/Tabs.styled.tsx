import type { MantineThemeOverride, TabsStylesParams } from "@mantine/core";
import { rem } from "@mantine/core";

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
        color: theme.fn.themeColor("text-dark"),
        padding: TAB_PADDING[orientation],
        maxWidth: "100%",
        "&:hover": {
          borderColor: theme.fn.themeColor("bg-medium"),
          backgroundColor: theme.fn.themeColor("brand-lighter"),
        },
        "&[data-active]": {
          color: theme.fn.themeColor("brand"),
          borderColor: theme.fn.themeColor("brand"),
        },
        "&:disabled": {
          color: theme.fn.themeColor("text-light"),
          opacity: 1,
        },
      },
      tabLabel: {
        fontSize: theme.fontSizes.md,
        fontWeight: "bold",
        lineHeight: theme.lineHeight,
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        overflow: "hidden",
      },
      tabIcon: {
        "&:not(:only-child)": {
          marginRight: rem(6),
        },
      },
      tabsList: {
        borderColor: theme.fn.themeColor("bg-medium"),
      },
    }),
  },
});
