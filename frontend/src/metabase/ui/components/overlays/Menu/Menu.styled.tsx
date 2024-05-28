import type { MantineThemeOverride } from "@mantine/core";
import { getStylesRef, px, rem } from "@mantine/core";

export const getMenuOverrides = (): MantineThemeOverride["components"] => ({
  Menu: {
    defaultProps: {
      radius: "sm",
      shadow: "md",
      withinPortal: true,
    },
    styles: theme => ({
      dropdown: {
        padding: "0.75rem !important",
        minWidth: "11.5rem",
        background: theme.fn.themeColor("bg-white"),
      },
      item: {
        color: theme.fn.themeColor("text-dark"),
        fontSize: theme.fontSizes.md,
        lineHeight: "1.5rem",
        padding: theme.spacing.sm,

        "&:disabled": {
          color: theme.fn.themeColor("text-light"),
        },
        "&[data-hovered]": {
          color: theme.fn.themeColor("brand"),
          backgroundColor: theme.fn.themeColor("brand-lighter"),

          [`& .${getStylesRef("itemRightSection")}`]: {
            color: theme.fn.themeColor("brand"),
          },
        },
      },
      itemIcon: {
        marginRight: theme.spacing.sm,
      },
      itemRightSection: {
        ref: getStylesRef("itemRightSection"),
        color: theme.fn.themeColor("text-light"),
        marginLeft: theme.spacing.md,
      },
      label: {
        color: theme.fn.themeColor("text-light"),
        fontSize: theme.fontSizes.sm,
        lineHeight: theme.lineHeight,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      },
      divider: {
        marginTop: rem(px(theme.spacing.xs) - 1),
        marginBottom: theme.spacing.xs,
        marginLeft: theme.spacing.sm,
        marginRight: theme.spacing.sm,
        borderTopColor: theme.fn.themeColor("border"),
      },
    }),
  },
});
