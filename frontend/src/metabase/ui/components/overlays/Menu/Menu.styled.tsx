import { getStylesRef, rem } from "@mantine/core";
import type { MantineThemeOverride } from "@mantine/core";

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
      },
      item: {
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.md,
        fontWeight: 700,
        lineHeight: "1.5rem",
        padding: theme.spacing.sm,

        "&:hover, &:focus": {
          color: theme.colors.brand[1],
          backgroundColor: theme.colors.bg[0],

          [`& .${getStylesRef("itemRightSection")}`]: {
            color: theme.colors.brand[1],
          },
        },
      },
      itemIcon: {
        marginRight: theme.spacing.sm,
      },
      itemRightSection: {
        ref: getStylesRef("itemRightSection"),
        color: theme.colors.text[0],
        marginLeft: "0.75rem",
      },
      label: {
        color: theme.colors.text[0],
        fontSize: theme.fontSizes.md,
        fontWeight: 700,
        lineHeight: theme.lineHeight,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      },
      divider: {
        marginTop: rem(7),
        marginBottom: rem(4),
        marginLeft: theme.spacing.sm,
        marginRight: theme.spacing.sm,
        borderTopColor: theme.colors.border[0],
      },
    }),
  },
});
