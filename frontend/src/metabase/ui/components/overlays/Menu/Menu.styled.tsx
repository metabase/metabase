import { getStylesRef } from "@mantine/core";
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
        lineHeight: "1rem",
        padding: theme.spacing.md,

        "&:hover, &:focus": {
          color: theme.fn.primaryColor(),
          backgroundColor: theme.colors.bg[0],

          [`& .${getStylesRef("itemRightSection")}`]: {
            color: theme.fn.primaryColor(),
          },
        },
      },
      itemIcon: {
        marginRight: "0.75rem",
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
        lineHeight: "1rem",
        padding: `0.375rem ${theme.spacing.md}`,
      },
      divider: {
        marginTop: theme.spacing.sm,
        marginBottom: theme.spacing.sm,
        marginLeft: theme.spacing.md,
        marginRight: theme.spacing.md,
        borderTopColor: theme.colors.border[0],
      },
    }),
  },
});
