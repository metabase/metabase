import type { MantineThemeOverride } from "@mantine/core";
import { SelectItem } from "./SelectItem";

export const getSelectOverrides = (): MantineThemeOverride["components"] => ({
  Select: {
    defaultProps: {
      withinPortal: true,
      itemComponent: SelectItem,
      clearButtonProps: {
        color: "text.2",
      },
    },
    styles: theme => ({
      rightSection: {
        svg: {
          width: "1rem",
          height: "1rem",
          "&[data-chevron]": {
            path: {
              d: 'path("M1.47 4.47a.75.75 0 0 1 1.06 0L8 9.94l5.47-5.47a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 0 1 0-1.06z")',
            },
          },
          "&:not([data-chevron])": {
            d: 'path("M4.53 3.47a.75.75 0 0 0-1.06 1.06L6.94 8l-3.47 3.47a.75.75 0 1 0 1.06 1.06L8 9.06l3.47 3.47a.75.75 0 1 0 1.06-1.06L9.06 8l3.47-3.47a.75.75 0 0 0-1.06-1.06L8 6.94 4.53 3.47z")',
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
