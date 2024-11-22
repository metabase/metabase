import type { MantineThemeOverride } from "@mantine/core";
import { getStylesRef, px, rem } from "@mantine/core";

import ZIndex from "metabase/css/core/z-index.module.css";

export const getMenuOverrides = (): MantineThemeOverride["components"] => ({
  Menu: {
    defaultProps: {
      radius: "sm",
      shadow: "md",
      withinPortal: true,
    },
    classNames: { dropdown: ZIndex.Overlay },
    styles: theme => ({
      dropdown: {
        padding: "0.75rem !important",
        minWidth: "11.5rem",
        overflow: "auto",
        background: "var(--mb-color-background)",
        borderColor: "var(--mb-color-border)",
      },
      item: {
        color: "var(--mb-color-text-primary)",
        fontSize: theme.fontSizes.md,
        lineHeight: "1.5rem",
        padding: theme.spacing.sm,

        "&:disabled": {
          color: theme.fn.themeColor("text-light"),
        },
        "&[data-hovered]": {
          color: "var(--mb-color-text-hover)",
          backgroundColor: "var(--mb-color-background-hover)",

          [`& .${getStylesRef("itemRightSection")}`]: {
            color: "var(--mb-color-text-hover)",
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
