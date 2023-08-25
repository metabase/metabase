import type { MantineThemeOverride } from "@mantine/core";

export const getSelectOverrides = (): MantineThemeOverride["components"] => ({
  Select: {
    defaultProps: {
      withinPortal: true,
    },
    styles: theme => ({
      itemsWrapper: {
        padding: "0.75rem",
      },
      item: {
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.md,
        fontWeight: 700,
        lineHeight: theme.lineHeight,
        padding: theme.spacing.md,
        "&:hover, &:focus": {
          color: theme.colors.brand[1],
          backgroundColor: theme.colors.bg[0],
        },
      },
    }),
  },
});
