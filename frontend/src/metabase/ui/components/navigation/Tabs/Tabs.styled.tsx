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
        color: "var(--mb-color-text-primary)",
        padding: TAB_PADDING[orientation],
        maxWidth: "100%",
        "&:hover": {
          borderColor: "var(--mb-color-background-hover)",
          backgroundColor: "var(--mb-color-background-hover)",
        },
        "&[data-active]": {
          color: "var(--mb-color-text-brand)",
          borderColor: "var(--mb-color-background-brand)",
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
        borderColor: "var(--mb-color-border)",
      },
    }),
  },
});
