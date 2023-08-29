import type { MantineThemeOverride } from "@mantine/core";
import { SelectItem } from "./SelectItem";

export const getSelectOverrides = (): MantineThemeOverride["components"] => ({
  Select: {
    defaultProps: {
      withinPortal: true,
      itemComponent: SelectItem,
    },
    styles: theme => ({
      wrapper: {
        marginTop: theme.spacing.xs,
      },
      rightSection: {
        svg: {
          color: theme.colors.text[2],
          width: "1rem",
          height: "1rem",

          "&[data-chevron] path": {
            d: 'path("M 1.38 4.19 a 0.7 0.7 90 0 1 0.99 0 L 7.5 9.32 l 5.13 -5.13 a 0.7 0.7 90 1 1 0.99 0.99 l -5.63 5.63 a 0.7 0.7 90 0 1 -0.99 0 l -5.63 -5.63 a 0.7 0.7 90 0 1 0 -0.99 z")',
          },
          "&:not([data-chevron]) path": {
            d: 'path("M 4.25 3.25 a 0.7 0.7 90 0 0 -0.99 0.99 L 6.51 7.5 l -3.25 3.25 a 0.7 0.7 90 1 0 0.99 0.99 L 7.5 8.49 l 3.25 3.25 a 0.7 0.7 90 1 0 0.99 -0.99 L 8.49 7.5 l 3.25 -3.25 a 0.7 0.7 90 0 0 -0.99 -0.99 L 7.5 6.51 L 4.25 3.25 z")',
          },
        },
      },
      itemsWrapper: {
        padding: "0.75rem",
      },
      item: {
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.md,
        fontWeight: 700,
        lineHeight: theme.lineHeight,
        padding: theme.spacing.md,
        "&:hover:not([data-disabled]), &:focus": {
          color: theme.colors.brand[1],
          backgroundColor: theme.colors.bg[0],
        },
        "&[data-disabled]": {
          color: theme.colors.text[0],
        },
      },
      separator: {
        padding: `0.375rem ${theme.spacing.md}`,
      },
      separatorLabel: {
        color: theme.colors.text[0],
        fontSize: theme.fontSizes.sm,
        fontWeight: "bold",
        lineHeight: theme.lineHeight,

        "&::after": {
          display: "none",
        },
      },
    }),
  },
});
